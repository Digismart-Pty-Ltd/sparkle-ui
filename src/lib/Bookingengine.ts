import { ref, runTransaction, get, set, push } from "firebase/database";
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

// ── PayFast config ────────────────────────────────────────────────────────────
// No hardcoded live fallback — if the env vars aren't set, this throws loudly
// at call time instead of silently using real production credentials. This
// prevents an unconfigured local/dev environment from accidentally submitting
// a real payment to PayFast.
const PF_MERCHANT_ID = import.meta.env.VITE_PAYFAST_MERCHANT_ID;
const PF_MERCHANT_KEY = import.meta.env.VITE_PAYFAST_MERCHANT_KEY;
const PF_BASE =
  import.meta.env.VITE_PAYFAST_BASE_URL ??
  "https://www.payfast.co.za/eng/process";

function assertPayFastConfigured(): void {
  if (!PF_MERCHANT_ID || !PF_MERCHANT_KEY) {
    throw new BookingError(
      "UNKNOWN",
      "Payment gateway is not configured. Please contact support.",
    );
  }
}

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

  // 1a. Class time already passed today?
  if (isClassTimePassed(cls.time, selectedDate)) {
    throw new BookingError("CLASS_PASSED", "This class has already started.");
  }

  // 1b. Category access check
  if (
    rules.allowedCategories.length > 0 &&
    !rules.allowedCategories.includes(cls.category)
  ) {
    throw new BookingError(
      "CATEGORY_BLOCKED",
      `${cls.category} is not included in your ${tier} membership.`,
    );
  }

  // 1c. Non-member / basic: must have credits
  if (rules.requiresCredits) {
    if ((user.classCredits ?? 0) < 1) {
      throw new BookingError(
        "NO_CREDITS",
        "You need at least 1 class credit to book.",
      );
    }
  }

  // 2. Atomic transaction
  const classBookingRef = ref(db, `class_bookings/${bKey}`);

  const result = await runTransaction(classBookingRef, (current) => {
    const bookings: Record<string, unknown> = current ?? {};

    if (bookings[user.uid]) return; // already booked, abort

    const bookedCount = Object.keys(bookings).length;
    if (bookedCount >= cls.spots) return; // full, abort

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

  // 3. Post-transaction limit checks — roll back if breached
  try {
    await assertMonthlyLimit(user.uid, rules.maxClassesPerMonth, dateKey);
    await assertDailyLimit(user.uid, rules.maxBookingsPerDay, dateKey);
  } catch (limitErr) {
    await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);
    throw limitErr;
  }

  // 4. Deduct credit for basic/non-member bookings
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

  // 5. Add to user's booking list
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
  assertPayFastConfigured();

  const bKey = buildBookingKey(cls.name, dateKey);

  // 1. Reserve spot atomically
  const classBookingRef = ref(db, `class_bookings/${bKey}`);

  const result = await runTransaction(classBookingRef, (current) => {
    const bookings: Record<string, unknown> = current ?? {};
    if (bookings[user.uid]) return; // already booked, abort
    const count = Object.keys(bookings).length;
    if (count >= cls.spots) return; // full, abort

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

  // 2. Create pending_booking record
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

  // 3. Redirect to PayFast
  // NOTE: notify_url now points at payfastNotify (index.ts), the single
  // consolidated webhook — payfastWebhook.ts is retired, do not repoint here.
  const formData: Record<string, string> = {
    merchant_id: PF_MERCHANT_ID!,
    merchant_key: PF_MERCHANT_KEY!,
    return_url: `${window.location.origin}/booking-success?bookingId=${bookingId}`,
    cancel_url: `${window.location.origin}/booking-cancel?bookingId=${bookingId}`,
    notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastNotify`,
    amount: price.toFixed(2),
    item_name: `${cls.name} – ${selectedDate.toLocaleDateString("en-ZA")}`,
    custom_str1: bookingId,
    custom_str2: "class_booking",
    custom_str3: user.uid,
    custom_str4: "class_booking",
    custom_int1: "1",
    email_address: user.email,
    name_first: user.name.split(" ")[0] || user.name,
    name_last: user.name.split(" ").slice(1).join(" ") || "-",
  };

  submitPayFastForm(PF_BASE, formData);
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
  assertPayFastConfigured();

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

  // NOTE: notify_url now points at payfastNotify (index.ts). Its credits
  // branch reads the real userId back out of this pending_bookings record
  // via custom_str1 (this purchaseId) — custom_str3 (user.uid) is kept for
  // reference/debugging but is NOT what the webhook uses to find the user.
  const formData: Record<string, string> = {
    merchant_id: PF_MERCHANT_ID!,
    merchant_key: PF_MERCHANT_KEY!,
    return_url: `${window.location.origin}/packages?status=success&purchaseId=${purchaseId}`,
    cancel_url: `${window.location.origin}/packages?status=cancelled`,
    notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastNotify`,
    amount: packPrice.toFixed(2),
    item_name: `MK2R ${packName} (${packCredits} class credits)`,
    custom_str1: purchaseId,
    custom_str2: "credit_pack",
    custom_str3: user.uid,
    custom_str4: "credits",
    custom_int1: String(packCredits),
    email_address: user.email,
    name_first: user.name.split(" ")[0] || user.name,
    name_last: user.name.split(" ").slice(1).join(" ") || "-",
  };

  submitPayFastForm(PF_BASE, formData);
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

function submitPayFastForm(action: string, data: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [k, v] of Object.entries(data)) {
    const inp = document.createElement("input");
    inp.type = "hidden";
    inp.name = k;
    inp.value = v;
    form.appendChild(inp);
  }
  document.body.appendChild(form);
  form.submit();
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

// import { ref, runTransaction, get, set, push } from "firebase/database";
// import { db } from "@/lib/firebase";
// import {
//   BookingError,
//   getTierFamily,
//   TIER_RULES,
//   type MembershipTier,
//   type GymClass,
//   type UserProfile,
//   type PendingBooking,
// } from "@/types/booking";
// import { formatDateKey } from "@/pages/ClassBooking";

// // ── PayFast config ────────────────────────────────────────────────────────────
// // LIVE credentials. Merchant ID/key are not secret — they're submitted in a
// // browser form POST to PayFast and are visible in page source regardless —
// // but they DO determine whether payments are real or sandbox, so make sure
// // VITE_PAYFAST_* env vars are NOT set to sandbox values in your production
// // build environment, or they'll override these fallbacks.
// const PF_MERCHANT_ID = import.meta.env.VITE_PAYFAST_MERCHANT_ID ?? "33590845";
// const PF_MERCHANT_KEY =
//   import.meta.env.VITE_PAYFAST_MERCHANT_KEY ?? "7cltivzw9kkvg";
// const PF_BASE =
//   import.meta.env.VITE_PAYFAST_BASE_URL ??
//   "https://www.payfast.co.za/eng/process";

// // ── Helpers ───────────────────────────────────────────────────────────────────

// function todayKey(): string {
//   return formatDateKey(new Date());
// }

// function thirtyDaysAgo(): string {
//   const d = new Date();
//   d.setDate(d.getDate() - 30);
//   return formatDateKey(d);
// }

// export function safeKey(str: string): string {
//   return str.replace(/[^a-zA-Z0-9_-]/g, "_");
// }

// export function buildBookingKey(className: string, dateKey: string): string {
//   return `${safeKey(className)}_${dateKey}`;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // A. BOOK FREE (members + non-members with credits)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function bookClass(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   selectedDate: Date,
// ): Promise<void> {
//   const tier = user.membership;
//   const family = getTierFamily(tier);
//   const rules = TIER_RULES[family];
//   const bKey = buildBookingKey(cls.name, dateKey);

//   // 1a. Class time already passed today?
//   if (isClassTimePassed(cls.time, selectedDate)) {
//     throw new BookingError("CLASS_PASSED", "This class has already started.");
//   }

//   // 1b. Category access check
//   if (
//     rules.allowedCategories.length > 0 &&
//     !rules.allowedCategories.includes(cls.category)
//   ) {
//     throw new BookingError(
//       "CATEGORY_BLOCKED",
//       `${cls.category} is not included in your ${tier} membership.`,
//     );
//   }

//   // 1c. Non-member / basic: must have credits
//   if (rules.requiresCredits) {
//     if ((user.classCredits ?? 0) < 1) {
//       throw new BookingError(
//         "NO_CREDITS",
//         "You need at least 1 class credit to book.",
//       );
//     }
//   }

//   // 2. Atomic transaction
//   const classBookingRef = ref(db, `class_bookings/${bKey}`);

//   const result = await runTransaction(classBookingRef, (current) => {
//     const bookings: Record<string, unknown> = current ?? {};

//     if (bookings[user.uid]) return; // already booked, abort

//     const bookedCount = Object.keys(bookings).length;
//     if (bookedCount >= cls.spots) return; // full, abort

//     bookings[user.uid] = {
//       name: user.name,
//       email: user.email,
//       bookedAt: Date.now(),
//       status: "confirmed",
//       membershipTier: tier,
//     };

//     return bookings;
//   });

//   if (!result.committed) {
//     const snap = await get(classBookingRef);
//     const current = snap.val() ?? {};
//     if (current[user.uid]) {
//       throw new BookingError(
//         "ALREADY_BOOKED",
//         "You're already booked for this class.",
//       );
//     }
//     const count = Object.keys(current).length;
//     if (count >= cls.spots) {
//       throw new BookingError("CLASS_FULL", "This class is full.");
//     }
//     throw new BookingError("UNKNOWN", "Booking failed. Please try again.");
//   }

//   // 3. Post-transaction limit checks — roll back if breached
//   try {
//     await assertMonthlyLimit(user.uid, rules.maxClassesPerMonth, dateKey);
//     await assertDailyLimit(user.uid, rules.maxBookingsPerDay, dateKey);
//   } catch (limitErr) {
//     await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);
//     throw limitErr;
//   }

//   // 4. Deduct credit for basic/non-member bookings
//   if (rules.requiresCredits) {
//     const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
//     const credSnap = await get(credRef);
//     const current = credSnap.exists() ? (credSnap.val() as number) : 0;
//     await set(credRef, Math.max(0, current - 1));
//     await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
//       amount: -1,
//       type: "class_spend",
//       note: `Booked: ${cls.name} on ${dateKey}`,
//       timestamp: Date.now(),
//     });
//   }

//   // 5. Add to user's booking list
//   const displayDate = selectedDate.toLocaleDateString("en-ZA", {
//     weekday: "short",
//     day: "numeric",
//     month: "short",
//   });

//   const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
//   const userBookingsSnap = await get(userBookingsRef);
//   const existing: unknown[] = userBookingsSnap.val() ?? [];

//   const alreadyListed = existing.some(
//     (b: any) => b.name === cls.name && b.dateKey === dateKey,
//   );
//   if (!alreadyListed) {
//     await set(userBookingsRef, [
//       ...existing,
//       {
//         name: cls.name,
//         dateKey,
//         date: cls.day ?? "",
//         displayDate,
//         time: cls.time,
//         trainer: cls.trainer,
//         category: cls.category,
//       },
//     ]);
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // B. INITIATE PAYFAST (single class — non-member, no credits)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function initiatePayFastForClass(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   selectedDate: Date,
// ): Promise<void> {
//   const bKey = buildBookingKey(cls.name, dateKey);

//   // 1. Reserve spot atomically
//   const classBookingRef = ref(db, `class_bookings/${bKey}`);

//   const result = await runTransaction(classBookingRef, (current) => {
//     const bookings: Record<string, unknown> = current ?? {};
//     if (bookings[user.uid]) return; // already booked, abort
//     const count = Object.keys(bookings).length;
//     if (count >= cls.spots) return; // full, abort

//     bookings[user.uid] = {
//       name: user.name,
//       email: user.email,
//       bookedAt: Date.now(),
//       status: "pending_payment",
//       membershipTier: user.membership,
//     };
//     return bookings;
//   });

//   if (!result.committed) {
//     const snap = await get(classBookingRef);
//     const current = snap.val() ?? {};
//     if (current[user.uid]) {
//       throw new BookingError(
//         "ALREADY_BOOKED",
//         "You're already booked for this class.",
//       );
//     }
//     throw new BookingError("CLASS_FULL", "This class is full.");
//   }

//   // 2. Create pending_booking record
//   const pendingRef = push(ref(db, "pending_bookings"));
//   const bookingId = pendingRef.key!;
//   const price = cls.price || 250;

//   const pending: PendingBooking = {
//     userId: user.uid,
//     userEmail: user.email,
//     userName: user.name,
//     classId: cls.id,
//     className: cls.name,
//     dateKey,
//     dateDisplay: selectedDate.toLocaleDateString("en-ZA", {
//       weekday: "long",
//       day: "numeric",
//       month: "long",
//     }),
//     time: cls.time,
//     price,
//     status: "pending_payment",
//     createdAt: Date.now(),
//   };
//   await set(pendingRef, pending);

//   // 3. Redirect to PayFast
//   const formData: Record<string, string> = {
//     merchant_id: PF_MERCHANT_ID,
//     merchant_key: PF_MERCHANT_KEY,
//     return_url: `${window.location.origin}/booking-success?bookingId=${bookingId}`,
//     cancel_url: `${window.location.origin}/booking-cancel?bookingId=${bookingId}`,
//     notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastWebhook`,
//     amount: price.toFixed(2),
//     item_name: `${cls.name} – ${selectedDate.toLocaleDateString("en-ZA")}`,
//     custom_str1: bookingId,
//     custom_str2: "class_booking",
//     custom_str3: user.uid,
//     custom_str4: "class_booking",
//     custom_int1: "1",
//     email_address: user.email,
//     name_first: user.name.split(" ")[0] || user.name,
//     name_last: user.name.split(" ").slice(1).join(" ") || "-",
//   };

//   submitPayFastForm(PF_BASE, formData);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // C. INITIATE PAYFAST (credit pack purchase)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function initiatePayFastForPack(
//   packId: string,
//   packName: string,
//   packPrice: number,
//   packCredits: number,
//   user: UserProfile,
// ): Promise<void> {
//   const purchaseRef = push(ref(db, "pending_bookings"));
//   const purchaseId = purchaseRef.key!;

//   await set(purchaseRef, {
//     userId: user.uid,
//     userEmail: user.email,
//     userName: user.name,
//     classId: packId,
//     className: packName,
//     dateKey: "",
//     dateDisplay: "",
//     time: "",
//     price: packPrice,
//     creditsPurchased: packCredits,
//     status: "pending_payment" as const,
//     createdAt: Date.now(),
//   });

//   const formData: Record<string, string> = {
//     merchant_id: PF_MERCHANT_ID,
//     merchant_key: PF_MERCHANT_KEY,
//     return_url: `${window.location.origin}/packages?status=success&purchaseId=${purchaseId}`,
//     cancel_url: `${window.location.origin}/packages?status=cancelled`,
//     notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastWebhook`,
//     amount: packPrice.toFixed(2),
//     item_name: `MK2R ${packName} (${packCredits} class credits)`,
//     custom_str1: purchaseId,
//     custom_str2: "credit_pack",
//     custom_str3: user.uid,
//     custom_str4: "credits", // ← fixed: was "class_booking"
//     custom_int1: String(packCredits),
//     email_address: user.email,
//     name_first: user.name.split(" ")[0] || user.name,
//     name_last: user.name.split(" ").slice(1).join(" ") || "-",
//   };

//   submitPayFastForm(PF_BASE, formData);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // D. CANCEL BOOKING (user-initiated)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function cancelBooking(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   refundCredit: boolean,
// ): Promise<void> {
//   const bKey = buildBookingKey(cls.name, dateKey);

//   await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);

//   const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
//   const userBookingsSnap = await get(userBookingsRef);
//   const existing: unknown[] = userBookingsSnap.val() ?? [];
//   await set(
//     userBookingsRef,
//     existing.filter(
//       (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
//     ),
//   );

//   if (refundCredit) {
//     const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
//     const credSnap = await get(credRef);
//     const current = credSnap.exists() ? (credSnap.val() as number) : 0;
//     await set(credRef, current + 1);
//     await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
//       amount: +1,
//       type: "user_cancel",
//       note: `Cancelled: ${cls.name} on ${dateKey}`,
//       timestamp: Date.now(),
//     });
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // E. LIMIT CHECKERS
// // ─────────────────────────────────────────────────────────────────────────────

// async function assertMonthlyLimit(
//   uid: string,
//   maxPerMonth: number,
//   newDateKey: string,
// ): Promise<void> {
//   if (maxPerMonth === 0 || maxPerMonth >= 999) return;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];

//   const since = thirtyDaysAgo();
//   const recent = bookings.filter(
//     (b) => b.dateKey && b.dateKey >= since && b.dateKey <= newDateKey,
//   );

//   if (recent.length >= maxPerMonth) {
//     throw new BookingError(
//       "MONTHLY_LIMIT",
//       `Monthly limit of ${maxPerMonth} classes reached for your membership.`,
//     );
//   }
// }

// async function assertDailyLimit(
//   uid: string,
//   maxPerDay: number,
//   dateKey: string,
// ): Promise<void> {
//   if (maxPerDay <= 1) return;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];

//   const todayCount = bookings.filter((b) => b.dateKey === dateKey).length;

//   if (todayCount >= maxPerDay) {
//     throw new BookingError(
//       "DAILY_LIMIT",
//       `You can only book ${maxPerDay} classes per day on your membership.`,
//     );
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // F. HELPERS
// // ─────────────────────────────────────────────────────────────────────────────

// function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
//   const now = new Date();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const sel = new Date(selectedDate);
//   sel.setHours(0, 0, 0, 0);
//   if (sel.getTime() !== today.getTime()) return false;
//   const [h, m] = classTime.split(":").map(Number);
//   return h < now.getHours() || (h === now.getHours() && m < now.getMinutes());
// }

// function submitPayFastForm(action: string, data: Record<string, string>): void {
//   const form = document.createElement("form");
//   form.method = "POST";
//   form.action = action;
//   for (const [k, v] of Object.entries(data)) {
//     const inp = document.createElement("input");
//     inp.type = "hidden";
//     inp.name = k;
//     inp.value = v;
//     form.appendChild(inp);
//   }
//   document.body.appendChild(form);
//   form.submit();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // G. REMAINING BOOKINGS HELPER (for UI display)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function getRemainingMonthlyBookings(
//   uid: string,
//   tier: MembershipTier,
// ): Promise<{ used: number; max: number; remaining: number } | null> {
//   const family = getTierFamily(tier);
//   const rules = TIER_RULES[family];
//   if (rules.requiresCredits || rules.maxClassesPerMonth >= 999) return null;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];
//   const since = thirtyDaysAgo();
//   const today = todayKey();
//   const used = bookings.filter(
//     (b) => b.dateKey >= since && b.dateKey <= today,
//   ).length;

//   return {
//     used,
//     max: rules.maxClassesPerMonth,
//     remaining: Math.max(0, rules.maxClassesPerMonth - used),
//   };
// }

// import { ref, runTransaction, get, set, push } from "firebase/database";
// import { db } from "@/lib/firebase";
// import {
//   BookingError,
//   getTierFamily,
//   TIER_RULES,
//   type MembershipTier,
//   type GymClass,
//   type UserProfile,
//   type PendingBooking,
// } from "@/types/booking";
// import { formatDateKey } from "@/pages/ClassBooking";

// // ── PayFast config ────────────────────────────────────────────────────────────
// const PF_MERCHANT_ID = import.meta.env.VITE_PAYFAST_MERCHANT_ID ?? "10000100";
// const PF_MERCHANT_KEY =
//   import.meta.env.VITE_PAYFAST_MERCHANT_KEY ?? "46f0cd694581a";
// const PF_BASE =
//   import.meta.env.VITE_PAYFAST_BASE_URL ??
//   "https://sandbox.payfast.co.za/eng/process";

// // ── Helpers ───────────────────────────────────────────────────────────────────

// function todayKey(): string {
//   return formatDateKey(new Date());
// }

// function thirtyDaysAgo(): string {
//   const d = new Date();
//   d.setDate(d.getDate() - 30);
//   return formatDateKey(d);
// }

// export function safeKey(str: string): string {
//   return str.replace(/[^a-zA-Z0-9_-]/g, "_");
// }

// export function buildBookingKey(className: string, dateKey: string): string {
//   return `${safeKey(className)}_${dateKey}`;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // A. BOOK FREE (members + non-members with credits)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function bookClass(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   selectedDate: Date,
// ): Promise<void> {
//   const tier = user.membership;
//   const family = getTierFamily(tier);
//   const rules = TIER_RULES[family];
//   const bKey = buildBookingKey(cls.name, dateKey);

//   // 1a. Class time already passed today?
//   if (isClassTimePassed(cls.time, selectedDate)) {
//     throw new BookingError("CLASS_PASSED", "This class has already started.");
//   }

//   // 1b. Category access check
//   if (
//     rules.allowedCategories.length > 0 &&
//     !rules.allowedCategories.includes(cls.category)
//   ) {
//     throw new BookingError(
//       "CATEGORY_BLOCKED",
//       `${cls.category} is not included in your ${tier} membership.`,
//     );
//   }

//   // 1c. Non-member / basic: must have credits
//   if (rules.requiresCredits) {
//     if ((user.classCredits ?? 0) < 1) {
//       throw new BookingError(
//         "NO_CREDITS",
//         "You need at least 1 class credit to book.",
//       );
//     }
//   }

//   // 2. Atomic transaction
//   const classBookingRef = ref(db, `class_bookings/${bKey}`);

//   const result = await runTransaction(classBookingRef, (current) => {
//     const bookings: Record<string, unknown> = current ?? {};

//     if (bookings[user.uid]) return; // already booked, abort

//     const bookedCount = Object.keys(bookings).length;
//     if (bookedCount >= cls.spots) return; // full, abort

//     bookings[user.uid] = {
//       name: user.name,
//       email: user.email,
//       bookedAt: Date.now(),
//       status: "confirmed",
//       membershipTier: tier,
//     };

//     return bookings;
//   });

//   if (!result.committed) {
//     const snap = await get(classBookingRef);
//     const current = snap.val() ?? {};
//     if (current[user.uid]) {
//       throw new BookingError(
//         "ALREADY_BOOKED",
//         "You're already booked for this class.",
//       );
//     }
//     const count = Object.keys(current).length;
//     if (count >= cls.spots) {
//       throw new BookingError("CLASS_FULL", "This class is full.");
//     }
//     throw new BookingError("UNKNOWN", "Booking failed. Please try again.");
//   }

//   // 3. Post-transaction limit checks — roll back if breached
//   try {
//     await assertMonthlyLimit(user.uid, rules.maxClassesPerMonth, dateKey);
//     await assertDailyLimit(user.uid, rules.maxBookingsPerDay, dateKey);
//   } catch (limitErr) {
//     await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);
//     throw limitErr;
//   }

//   // 4. Deduct credit for basic/non-member bookings
//   if (rules.requiresCredits) {
//     const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
//     const credSnap = await get(credRef);
//     const current = credSnap.exists() ? (credSnap.val() as number) : 0;
//     await set(credRef, Math.max(0, current - 1));
//     await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
//       amount: -1,
//       type: "class_spend",
//       note: `Booked: ${cls.name} on ${dateKey}`,
//       timestamp: Date.now(),
//     });
//   }

//   // 5. Add to user's booking list
//   const displayDate = selectedDate.toLocaleDateString("en-ZA", {
//     weekday: "short",
//     day: "numeric",
//     month: "short",
//   });

//   const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
//   const userBookingsSnap = await get(userBookingsRef);
//   const existing: unknown[] = userBookingsSnap.val() ?? [];

//   const alreadyListed = existing.some(
//     (b: any) => b.name === cls.name && b.dateKey === dateKey,
//   );
//   if (!alreadyListed) {
//     await set(userBookingsRef, [
//       ...existing,
//       {
//         name: cls.name,
//         dateKey,
//         date: cls.day ?? "",
//         displayDate,
//         time: cls.time,
//         trainer: cls.trainer,
//         category: cls.category,
//       },
//     ]);
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // B. INITIATE PAYFAST (single class — non-member, no credits)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function initiatePayFastForClass(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   selectedDate: Date,
// ): Promise<void> {
//   const bKey = buildBookingKey(cls.name, dateKey);

//   // 1. Reserve spot atomically
//   const classBookingRef = ref(db, `class_bookings/${bKey}`);

//   const result = await runTransaction(classBookingRef, (current) => {
//     const bookings: Record<string, unknown> = current ?? {};
//     if (bookings[user.uid]) return; // already booked, abort
//     const count = Object.keys(bookings).length;
//     if (count >= cls.spots) return; // full, abort

//     bookings[user.uid] = {
//       name: user.name,
//       email: user.email,
//       bookedAt: Date.now(),
//       status: "pending_payment",
//       membershipTier: user.membership,
//     };
//     return bookings;
//   });

//   if (!result.committed) {
//     const snap = await get(classBookingRef);
//     const current = snap.val() ?? {};
//     if (current[user.uid]) {
//       throw new BookingError(
//         "ALREADY_BOOKED",
//         "You're already booked for this class.",
//       );
//     }
//     throw new BookingError("CLASS_FULL", "This class is full.");
//   }

//   // 2. Create pending_booking record
//   const pendingRef = push(ref(db, "pending_bookings"));
//   const bookingId = pendingRef.key!;
//   const price = cls.price || 250;

//   const pending: PendingBooking = {
//     userId: user.uid,
//     userEmail: user.email,
//     userName: user.name,
//     classId: cls.id,
//     className: cls.name,
//     dateKey,
//     dateDisplay: selectedDate.toLocaleDateString("en-ZA", {
//       weekday: "long",
//       day: "numeric",
//       month: "long",
//     }),
//     time: cls.time,
//     price,
//     status: "pending_payment",
//     createdAt: Date.now(),
//   };
//   await set(pendingRef, pending);

//   // 3. Redirect to PayFast
//   const formData: Record<string, string> = {
//     merchant_id: PF_MERCHANT_ID,
//     merchant_key: PF_MERCHANT_KEY,
//     return_url: `${window.location.origin}/booking-success?bookingId=${bookingId}`,
//     cancel_url: `${window.location.origin}/booking-cancel?bookingId=${bookingId}`,
//     notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastWebhook`,
//     amount: price.toFixed(2),
//     item_name: `${cls.name} – ${selectedDate.toLocaleDateString("en-ZA")}`,
//     custom_str1: bookingId,
//     custom_str2: "class_booking",
//     custom_str3: user.uid,
//     custom_str4: "class_booking",
//     custom_int1: "1",
//     email_address: user.email,
//     name_first: user.name.split(" ")[0] || user.name,
//     name_last: user.name.split(" ").slice(1).join(" ") || "-",
//   };

//   submitPayFastForm(PF_BASE, formData);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // C. INITIATE PAYFAST (credit pack purchase)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function initiatePayFastForPack(
//   packId: string,
//   packName: string,
//   packPrice: number,
//   packCredits: number,
//   user: UserProfile,
// ): Promise<void> {
//   const purchaseRef = push(ref(db, "pending_bookings"));
//   const purchaseId = purchaseRef.key!;

//   await set(purchaseRef, {
//     userId: user.uid,
//     userEmail: user.email,
//     userName: user.name,
//     classId: packId,
//     className: packName,
//     dateKey: "",
//     dateDisplay: "",
//     time: "",
//     price: packPrice,
//     creditsPurchased: packCredits,
//     status: "pending_payment" as const,
//     createdAt: Date.now(),
//   });

//   const formData: Record<string, string> = {
//     merchant_id: PF_MERCHANT_ID,
//     merchant_key: PF_MERCHANT_KEY,
//     return_url: `${window.location.origin}/packages?status=success&purchaseId=${purchaseId}`,
//     cancel_url: `${window.location.origin}/packages?status=cancelled`,
//     notify_url: `https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastWebhook`,
//     amount: packPrice.toFixed(2),
//     item_name: `MK2R ${packName} (${packCredits} class credits)`,
//     custom_str1: purchaseId,
//     custom_str2: "credit_pack",
//     custom_str3: user.uid,
//     custom_str4: "credits", // ← fixed: was "class_booking"
//     custom_int1: String(packCredits),
//     email_address: user.email,
//     name_first: user.name.split(" ")[0] || user.name,
//     name_last: user.name.split(" ").slice(1).join(" ") || "-",
//   };

//   submitPayFastForm(PF_BASE, formData);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // D. CANCEL BOOKING (user-initiated)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function cancelBooking(
//   cls: GymClass,
//   dateKey: string,
//   user: UserProfile,
//   refundCredit: boolean,
// ): Promise<void> {
//   const bKey = buildBookingKey(cls.name, dateKey);

//   await set(ref(db, `class_bookings/${bKey}/${user.uid}`), null);

//   const userBookingsRef = ref(db, `mk2_users/${user.uid}/bookings`);
//   const userBookingsSnap = await get(userBookingsRef);
//   const existing: unknown[] = userBookingsSnap.val() ?? [];
//   await set(
//     userBookingsRef,
//     existing.filter(
//       (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
//     ),
//   );

//   if (refundCredit) {
//     const credRef = ref(db, `mk2_users/${user.uid}/classCredits`);
//     const credSnap = await get(credRef);
//     const current = credSnap.exists() ? (credSnap.val() as number) : 0;
//     await set(credRef, current + 1);
//     await push(ref(db, `mk2_users/${user.uid}/creditHistory`), {
//       amount: +1,
//       type: "user_cancel",
//       note: `Cancelled: ${cls.name} on ${dateKey}`,
//       timestamp: Date.now(),
//     });
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // E. LIMIT CHECKERS
// // ─────────────────────────────────────────────────────────────────────────────

// async function assertMonthlyLimit(
//   uid: string,
//   maxPerMonth: number,
//   newDateKey: string,
// ): Promise<void> {
//   if (maxPerMonth === 0 || maxPerMonth >= 999) return;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];

//   const since = thirtyDaysAgo();
//   const recent = bookings.filter(
//     (b) => b.dateKey && b.dateKey >= since && b.dateKey <= newDateKey,
//   );

//   if (recent.length >= maxPerMonth) {
//     throw new BookingError(
//       "MONTHLY_LIMIT",
//       `Monthly limit of ${maxPerMonth} classes reached for your membership.`,
//     );
//   }
// }

// async function assertDailyLimit(
//   uid: string,
//   maxPerDay: number,
//   dateKey: string,
// ): Promise<void> {
//   if (maxPerDay <= 1) return;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];

//   const todayCount = bookings.filter((b) => b.dateKey === dateKey).length;

//   if (todayCount >= maxPerDay) {
//     throw new BookingError(
//       "DAILY_LIMIT",
//       `You can only book ${maxPerDay} classes per day on your membership.`,
//     );
//   }
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // F. HELPERS
// // ─────────────────────────────────────────────────────────────────────────────

// function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
//   const now = new Date();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const sel = new Date(selectedDate);
//   sel.setHours(0, 0, 0, 0);
//   if (sel.getTime() !== today.getTime()) return false;
//   const [h, m] = classTime.split(":").map(Number);
//   return h < now.getHours() || (h === now.getHours() && m < now.getMinutes());
// }

// function submitPayFastForm(action: string, data: Record<string, string>): void {
//   const form = document.createElement("form");
//   form.method = "POST";
//   form.action = action;
//   for (const [k, v] of Object.entries(data)) {
//     const inp = document.createElement("input");
//     inp.type = "hidden";
//     inp.name = k;
//     inp.value = v;
//     form.appendChild(inp);
//   }
//   document.body.appendChild(form);
//   form.submit();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // G. REMAINING BOOKINGS HELPER (for UI display)
// // ─────────────────────────────────────────────────────────────────────────────
// export async function getRemainingMonthlyBookings(
//   uid: string,
//   tier: MembershipTier,
// ): Promise<{ used: number; max: number; remaining: number } | null> {
//   const family = getTierFamily(tier);
//   const rules = TIER_RULES[family];
//   if (rules.requiresCredits || rules.maxClassesPerMonth >= 999) return null;

//   const snap = await get(ref(db, `mk2_users/${uid}/bookings`));
//   const bookings: any[] = snap.val() ?? [];
//   const since = thirtyDaysAgo();
//   const today = todayKey();
//   const used = bookings.filter(
//     (b) => b.dateKey >= since && b.dateKey <= today,
//   ).length;

//   return {
//     used,
//     max: rules.maxClassesPerMonth,
//     remaining: Math.max(0, rules.maxClassesPerMonth - used),
//   };
// }
