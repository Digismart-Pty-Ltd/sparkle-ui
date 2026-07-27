import { ref, runTransaction, get, set, push } from "firebase/database";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase";
import {
  BookingError,
  getTierFamily,
  TIER_RULES,
  type MembershipTier,
  type GymClass,
  type UserProfile,
  type PendingBooking,
} from "@/types/booking";
import { formatDateKey } from "@/pages/ClassBooking";

// PayFast signing now happens entirely server-side via payfastSignPurchase
// (Cloud Function) — no merchant ID/key, no form-signing, no live PayFast
// config lives in this file or the frontend bundle anymore. This mirrors
// the same architecture used for membership subscriptions (payfastSign).
const functions = getFunctions(undefined, "europe-west1");

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayKey(): string {
  return formatDateKey(new Date());
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return formatDateKey(d);
}

export function safeKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function buildBookingKey(className: string, dateKey: string): string {
  return `${safeKey(className)}_${dateKey}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// A. BOOK FREE (members + non-members with credits)
// ─────────────────────────────────────────────────────────────────────────────
export async function bookClass(
  cls: GymClass,
  dateKey: string,
  user: UserProfile,
  selectedDate: Date,
): Promise<void> {
  const tier = user.membership;
  const family = getTierFamily(tier);
  const rules = TIER_RULES[family];
  const bKey = buildBookingKey(cls.name, dateKey);

  if (isClassTimePassed(cls.time, selectedDate)) {
    throw new BookingError("CLASS_PASSED", "This class has already started.");
  }

  if (
    rules.allowedCategories.length > 0 &&
    !rules.allowedCategories.includes(cls.category)
  ) {
    throw new BookingError(
      "CATEGORY_BLOCKED",
      `${cls.category} is not included in your ${tier} membership.`,
    );
  }

  if (rules.requiresCredits) {
    if ((user.classCredits ?? 0) < 1) {
      throw new BookingError(
        "NO_CREDITS",
        "You need at least 1 class credit to book.",
      );
    }
  }

  const classBookingRef = ref(db, `class_bookings/${bKey}`);

  const result = await runTransaction(classBookingRef, (current) => {
    const bookings: Record<string, unknown> = current ?? {};

    if (bookings[user.uid]) return;

    const bookedCount = Object.keys(bookings).length;
    if (bookedCount >= cls.spots) return;

    bookings[user.uid] = {
      name: user.name,
      email: user.email,
      bookedAt: Date.now(),
      status: "confirmed",
      membershipTier: tier,
    };

    return bookings;
  });

  if (!result.committed) {
    const snap = await get(classBookingRef);
    const current = snap.val() ?? {};
    if (current[user.uid]) {
      throw new BookingError(
        "ALREADY_BOOKED",
        "You're already booked for this class.",
      );
    }
    const count = Object.keys(current).length;
    if (count >= cls.spots) {
      throw new BookingError("CLASS_FULL", "This class is full.");
    }
    throw new BookingError("UNKNOWN", "Booking failed. Please try again.");
  }

  try {
    await assertMonthlyLimit(user.uid, rules.maxClassesPerMonth, dateKey);
    await assertDailyLimit(user.uid, rules.maxBookingsPerDay, dateKey);
  } catch (limitErr) {
    await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);
    throw limitErr;
  }

  if (rules.requiresCredits) {
    const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
    const credSnap = await get(credRef);
    const current = credSnap.exists() ? (credSnap.val() as number) : 0;
    await set(credRef, Math.max(0, current - 1));
    await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
      amount: -1,
      type: "class_spend",
      note: `Booked: ${cls.name} on ${dateKey}`,
      timestamp: Date.now(),
    });
  }

  const displayDate = selectedDate.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
  const userBookingsSnap = await get(userBookingsRef);
  const existing: unknown[] = userBookingsSnap.val() ?? [];

  const alreadyListed = existing.some(
    (b: any) => b.name === cls.name && b.dateKey === dateKey,
  );
  if (!alreadyListed) {
    await set(userBookingsRef, [
      ...existing,
      {
        name: cls.name,
        dateKey,
        date: cls.day ?? "",
        displayDate,
        time: cls.time,
        trainer: cls.trainer,
        category: cls.category,
      },
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B. INITIATE PAYFAST (single class — non-member, no credits)
// ─────────────────────────────────────────────────────────────────────────────
export async function initiatePayFastForClass(
  cls: GymClass,
  dateKey: string,
  user: UserProfile,
  selectedDate: Date,
): Promise<void> {
  const bKey = buildBookingKey(cls.name, dateKey);

  // 1. Reserve spot atomically — unchanged, purely a Firebase write.
  const classBookingRef = ref(db, `class_bookings/${bKey}`);

  const result = await runTransaction(classBookingRef, (current) => {
    const bookings: Record<string, unknown> = current ?? {};
    if (bookings[user.uid]) return;
    const count = Object.keys(bookings).length;
    if (count >= cls.spots) return;

    bookings[user.uid] = {
      name: user.name,
      email: user.email,
      bookedAt: Date.now(),
      status: "pending_payment",
      membershipTier: user.membership,
    };
    return bookings;
  });

  if (!result.committed) {
    const snap = await get(classBookingRef);
    const current = snap.val() ?? {};
    if (current[user.uid]) {
      throw new BookingError(
        "ALREADY_BOOKED",
        "You're already booked for this class.",
      );
    }
    throw new BookingError("CLASS_FULL", "This class is full.");
  }

  // 2. Create pending_booking record — unchanged.
  const pendingRef = push(ref(db, "pending_bookings"));
  const bookingId = pendingRef.key!;
  const price = cls.price || 250;

  const pending: PendingBooking = {
    userId: user.uid,
    userEmail: user.email,
    userName: user.name,
    classId: cls.id,
    className: cls.name,
    dateKey,
    dateDisplay: selectedDate.toLocaleDateString("en-ZA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    time: cls.time,
    price,
    status: "pending_payment",
    createdAt: Date.now(),
  };
  await set(pendingRef, pending);

  // 3. Get a signed checkout URL from the Cloud Function — the server
  // reads this exact pending_bookings record back, so the signed amount
  // always matches what we actually reserved, regardless of anything a
  // tampered client might try to send.
  try {
    const payfastSignPurchase = httpsCallable(functions, "payfastSignPurchase");
    const signResult = await payfastSignPurchase({
      pendingBookingId: bookingId,
    });
    const data = signResult.data as { url?: string };
    if (!data.url) {
      throw new BookingError(
        "PAYMENT_FAILED",
        "Could not start payment. Please try again.",
      );
    }
    window.location.href = data.url;
  } catch (err: any) {
    throw new BookingError(
      "PAYMENT_FAILED",
      err?.message ?? "Could not start payment. Please try again.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C. INITIATE PAYFAST (credit pack purchase)
// ─────────────────────────────────────────────────────────────────────────────
export async function initiatePayFastForPack(
  packId: string,
  packName: string,
  packPrice: number,
  packCredits: number,
  user: UserProfile,
): Promise<void> {
  const purchaseRef = push(ref(db, "pending_bookings"));
  const purchaseId = purchaseRef.key!;

  await set(purchaseRef, {
    userId: user.uid,
    userEmail: user.email,
    userName: user.name,
    classId: packId,
    className: packName,
    dateKey: "",
    dateDisplay: "",
    time: "",
    price: packPrice,
    creditsPurchased: packCredits,
    status: "pending_payment" as const,
    createdAt: Date.now(),
  });

  try {
    const payfastSignPurchase = httpsCallable(functions, "payfastSignPurchase");
    const signResult = await payfastSignPurchase({
      pendingBookingId: purchaseId,
    });
    const data = signResult.data as { url?: string };
    if (!data.url) {
      throw new BookingError(
        "PAYMENT_FAILED",
        "Could not start payment. Please try again.",
      );
    }
    window.location.href = data.url;
  } catch (err: any) {
    throw new BookingError(
      "PAYMENT_FAILED",
      err?.message ?? "Could not start payment. Please try again.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D. CANCEL BOOKING (user-initiated)
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelBooking(
  cls: GymClass,
  dateKey: string,
  user: UserProfile,
  refundCredit: boolean,
): Promise<void> {
  const bKey = buildBookingKey(cls.name, dateKey);

  await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);

  const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
  const userBookingsSnap = await get(userBookingsRef);
  const existing: unknown[] = userBookingsSnap.val() ?? [];
  await set(
    userBookingsRef,
    existing.filter(
      (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
    ),
  );

  if (refundCredit) {
    const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
    const credSnap = await get(credRef);
    const current = credSnap.exists() ? (credSnap.val() as number) : 0;
    await set(credRef, current + 1);
    await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
      amount: +1,
      type: "user_cancel",
      note: `Cancelled: ${cls.name} on ${dateKey}`,
      timestamp: Date.now(),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// E. LIMIT CHECKERS
// ─────────────────────────────────────────────────────────────────────────────

async function assertMonthlyLimit(
  uid: string,
  maxPerMonth: number,
  newDateKey: string,
): Promise<void> {
  if (maxPerMonth === 0 || maxPerMonth >= 999) return;

  const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
  const bookings: any[] = snap.val() ?? [];

  const since = thirtyDaysAgo();
  const recent = bookings.filter(
    (b) => b.dateKey && b.dateKey >= since && b.dateKey <= newDateKey,
  );

  if (recent.length >= maxPerMonth) {
    throw new BookingError(
      "MONTHLY_LIMIT",
      `Monthly limit of ${maxPerMonth} classes reached for your membership.`,
    );
  }
}

async function assertDailyLimit(
  uid: string,
  maxPerDay: number,
  dateKey: string,
): Promise<void> {
  if (maxPerDay <= 1) return;

  const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
  const bookings: any[] = snap.val() ?? [];

  const todayCount = bookings.filter((b) => b.dateKey === dateKey).length;

  if (todayCount >= maxPerDay) {
    throw new BookingError(
      "DAILY_LIMIT",
      `You can only book ${maxPerDay} classes per day on your membership.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F. HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);
  if (sel.getTime() !== today.getTime()) return false;
  const [h, m] = classTime.split(":").map(Number);
  return h < now.getHours() || (h === now.getHours() && m < now.getMinutes());
}

// ─────────────────────────────────────────────────────────────────────────────
// G. REMAINING BOOKINGS HELPER (for UI display)
// ─────────────────────────────────────────────────────────────────────────────
export async function getRemainingMonthlyBookings(
  uid: string,
  tier: MembershipTier,
): Promise<{ used: number; max: number; remaining: number } | null> {
  const family = getTierFamily(tier);
  const rules = TIER_RULES[family];
  if (rules.requiresCredits || rules.maxClassesPerMonth >= 999) return null;

  const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
  const bookings: any[] = snap.val() ?? [];
  const since = thirtyDaysAgo();
  const today = todayKey();
  const used = bookings.filter(
    (b) => b.dateKey >= since && b.dateKey <= today,
  ).length;

  return {
    used,
    max: rules.maxClassesPerMonth,
    remaining: Math.max(0, rules.maxClassesPerMonth - used),
  };
}
