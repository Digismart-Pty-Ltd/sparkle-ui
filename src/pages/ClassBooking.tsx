import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { logEvent, db } from "@/lib/firebase";
import { ref, onValue, set, push, get, remove } from "firebase/database";
import { Btn } from "@/components/shared/Btn";
import { Tag } from "@/components/shared/Tag";
import { PageTitle } from "@/components/shared/PageTitle";
import { bookClass, initiatePayFastForClass } from "@/lib/Bookingengine";
import { motion, AnimatePresence } from "framer-motion";

// ── Category colours ──────────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  Crossfit: "hsl(20 100% 50%)",
  Gymnastics: "hsl(263 85% 58%)",
  Strength: "hsl(38 92% 44%)",
  "Olympic Lifting": "hsl(217 91% 53%)",
  "Saturday Smasher": "hsl(142 72% 37%)",
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const CANCEL_CUTOFF_MINUTES = 60;

const FALLBACK_CLASSES = [
  {
    name: "CrossFit WOD",
    time: "05:30",
    trainer: "Coach Marcus",
    spots: 20,
    subtitle: "Workout of the Day",
    category: "Crossfit",
    details: [
      "Daily programmed WOD",
      "Olympic lifting + gymnastics",
      "Scaled options available",
    ],
    duration: "60 min",
    intensity: "Very High",
    price: 250,
    chargeNonMembers: true,
  },
  {
    name: "Strength Circuit",
    time: "09:00",
    trainer: "Coach Busi",
    spots: 20,
    subtitle: "Full-body resistance training",
    category: "Strength",
    details: [
      "5 stations × 4 rounds",
      "Barbell, dumbbell & bodyweight",
      "Progressive overload",
    ],
    duration: "60 min",
    intensity: "Medium–High",
    price: 250,
    chargeNonMembers: true,
  },
  {
    name: "Gymnastics",
    time: "10:00",
    trainer: "Coach Nomsa",
    spots: 20,
    subtitle: "Movement & bodyweight skills",
    category: "Gymnastics",
    details: [
      "Handstands & ring work",
      "Pull-ups & muscle-ups",
      "All skill levels welcome",
    ],
    duration: "60 min",
    intensity: "Medium–High",
    price: 250,
    chargeNonMembers: true,
  },
  {
    name: "Olympic Lifting",
    time: "17:00",
    trainer: "Coach Dlamini",
    spots: 20,
    subtitle: "Snatch & clean and jerk",
    category: "Olympic Lifting",
    details: [
      "Technique-focused sessions",
      "Progressive loading",
      "Comp & scaled weights",
    ],
    duration: "60 min",
    intensity: "High",
    price: 250,
    chargeNonMembers: true,
  },
  {
    name: "Saturday Smasher",
    time: "08:00",
    trainer: "Coach Marcus",
    spots: 20,
    subtitle: "Weekend community WOD",
    category: "Saturday Smasher",
    details: [
      "Partner & team workouts",
      "Fun competitive format",
      "All levels welcome",
    ],
    duration: "60 min",
    intensity: "High",
    price: 250,
    chargeNonMembers: true,
  },
];

const intColor = (i: string) =>
  i.includes("Very")
    ? "hsl(0 84% 51%)"
    : i.includes("High")
      ? "hsl(20 100% 50%)"
      : i.includes("Medium")
        ? "hsl(38 92% 44%)"
        : "hsl(142 72% 37%)";

// ── Date helpers ──────────────────────────────────────────────────────────────
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function getDayName(date: Date): string {
  return DAYS[[6, 0, 1, 2, 3, 4, 5][date.getDay()]];
}
export function safeKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, "_");
}
export function buildBookingKey(className: string, dateKey: string): string {
  return `${safeKey(className)}_${dateKey}`;
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(selectedDate);
  selected.setHours(0, 0, 0, 0);
  if (selected.getTime() !== today.getTime()) return false;
  const [h, mn] = classTime.split(":").map(Number);
  return h < now.getHours() || (h === now.getHours() && mn < now.getMinutes());
}

function isCancelWindowClosed(classTime: string, classDate: Date): boolean {
  const now = new Date();
  const [h, mn] = classTime.split(":").map(Number);
  const classStart = new Date(classDate);
  classStart.setHours(h, mn, 0, 0);
  const cutoff = new Date(
    classStart.getTime() - CANCEL_CUTOFF_MINUTES * 60 * 1000,
  );
  return now >= cutoff;
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({
  selectedDate,
  onSelect,
  bookedDates,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  bookedDates: Set<string>;
}) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="mk2-card mb-5" style={{ maxWidth: 320 }}>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
        >
          ←
        </button>
        <span className="font-bold text-xs">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center text-[9px] font-bold text-muted-foreground py-0.5"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const date = new Date(viewYear, viewMonth, day);
          date.setHours(0, 0, 0, 0);
          const key = formatDateKey(date);
          const isPast = date < today;
          const isToday = date.getTime() === today.getTime();
          const isSel = formatDateKey(selectedDate) === key;
          const hasBkg = bookedDates.has(key);
          return (
            <button
              key={i}
              onClick={() =>
                !isPast && onSelect(new Date(viewYear, viewMonth, day))
              }
              disabled={isPast}
              className={[
                "relative w-full aspect-square rounded text-[11px] font-semibold transition-all flex flex-col items-center justify-center leading-none",
                isPast
                  ? "opacity-20 cursor-not-allowed"
                  : "cursor-pointer hover:bg-secondary",
                isSel ? "bg-orange-500 text-black" : "",
                isToday && !isSel
                  ? "ring-1 ring-orange-500 text-orange-500"
                  : "",
              ].join(" ")}
            >
              {day}
              {hasBkg && !isSel && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />{" "}
          Booked
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded ring-1 ring-orange-500 inline-block" />{" "}
          Today
        </div>
      </div>
    </div>
  );
}

// ── WOD Panel ─────────────────────────────────────────────────────────────────
function WodPanel({ cls, color }: { cls: any; color: string }) {
  const [open, setOpen] = useState(false);
  const wod: string = String(cls.wod ?? "").trim();
  if (!wod) return null;
  const lines = wod.split("\n");

  return (
    <div className="mt-3 rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary"
        style={{
          background: "hsl(var(--secondary))",
          color,
          border: "none",
          cursor: "pointer",
        }}
      >
        <span className="flex items-center gap-2">
          <span>📋</span>
          <span>View Today's WOD</span>
        </span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>
          {open ? "▲ Hide" : "▼ Show"}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-3 pb-3 pt-2 text-xs leading-relaxed bg-background">
              <div className="mb-2 pb-2 border-b border-border">
                <div className="font-bold text-sm">{cls.trainer}</div>
                <div className="text-[11px]" style={{ color }}>
                  {cls.category}
                </div>
              </div>
              <div>
                {lines.map((line, i) => {
                  const t = line.trim();
                  if (!t) return <div key={i} className="h-1.5" />;
                  const isPart = /^part\s/i.test(t);
                  const isHeader =
                    !isPart &&
                    (t.endsWith(":") ||
                      (t === t.toUpperCase() &&
                        t.length < 40 &&
                        /[A-Z]/.test(t)));
                  const isWeight = /^(comp|scaled|beg|rx)\s*:/i.test(t);
                  if (isPart)
                    return (
                      <div key={i} className="font-bold mt-2" style={{ color }}>
                        {t}
                      </div>
                    );
                  if (isHeader)
                    return (
                      <div key={i} className="font-bold text-foreground mt-1">
                        {t}
                      </div>
                    );
                  if (isWeight)
                    return (
                      <div
                        key={i}
                        className="text-[10px] text-muted-foreground italic"
                      >
                        {t}
                      </div>
                    );
                  return (
                    <div key={i} className="text-muted-foreground">
                      {t}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ClassBooking({ setPage }: { setPage?: (p: string) => void }) {
  const { user, updateUser, toast } = useAuth();
  const { isMobile } = useBreakpoint();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date(today));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showWhoBooked, setShowWhoBooked] = useState<string | null>(null);
  const [classBookings, setClassBookings] = useState<
    Record<string, Record<string, any>>
  >({});
  const [classWaitlists, setClassWaitlists] = useState<
    Record<string, Record<string, any>>
  >({});
  const [adminClasses, setAdminClasses] = useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [processingWaitlist, setProcessingWaitlist] = useState<string | null>(
    null,
  );

  useEffect(() => {
    return onValue(ref(db, "admin_classes"), (snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val())
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        setAdminClasses(list);
      } else setAdminClasses([]);
      setLoadingClasses(false);
    });
  }, []);

  useEffect(() => {
    return onValue(ref(db, "class_bookings"), (snap) =>
      setClassBookings(snap.val() ?? {}),
    );
  }, []);

  useEffect(() => {
    return onValue(ref(db, "class_waitlist"), (snap) =>
      setClassWaitlists(snap.val() ?? {}),
    );
  }, []);

  if (!user) return null;

  const dateKey = formatDateKey(selectedDate);
  const dayName = getDayName(selectedDate);
  const CLASSES = adminClasses.length > 0 ? adminClasses : FALLBACK_CLASSES;

  const dayClasses = CLASSES.filter((cls) => {
    if (adminClasses.length > 0) {
      if (cls.scheduleType === "date") return cls.specificDate === dateKey;
      return cls.day === dayName;
    }
    return true;
  });

  const bKey = (cls: any) => buildBookingKey(cls.name, dateKey);
  const isBooked = (cls: any) => !!classBookings[bKey(cls)]?.[user.uid];
  const bookedCount = (cls: any) =>
    Object.keys(classBookings[bKey(cls)] ?? {}).length;
  const bookedList = (cls: any) =>
    Object.values(classBookings[bKey(cls)] ?? {});
  const spotsLeft = (cls: any) =>
    Math.max(0, Number(cls.spots || 20) - bookedCount(cls));
  const isOnWaitlist = (cls: any) => !!classWaitlists[bKey(cls)]?.[user.uid];
  const waitlistCount = (cls: any) =>
    Object.keys(classWaitlists[bKey(cls)] ?? {}).length;
  const waitlistPosition = (cls: any) => {
    const entries = Object.entries(classWaitlists[bKey(cls)] ?? {})
      .map(([uid, val]: [string, any]) => ({
        uid,
        joinedAt: val.joinedAt ?? 0,
      }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const pos = entries.findIndex((e) => e.uid === user.uid);
    return pos >= 0 ? pos + 1 : -1;
  };

  const bookedDates = new Set<string>(
    user.bookings.map((b: any) => b.dateKey).filter(Boolean),
  );
  // "Member" here means "gym admin has assigned a contract tier" — see
  // hasGymContract() in AuthContext.tsx. An unset membership is NOT a
  // "basic" gym tier, it's simply no contract on file yet, so those
  // people correctly fall into the non-member / pay-per-class flow below.
  const isMember = Boolean(user.membership);
  const isChargeable = (cls: any) =>
    Boolean(cls.chargeNonMembers) && Number(cls.price) > 0;

  // ── Auto-promote first waitlist member ────────────────────────────────────
  const promoteFromWaitlist = async (cls: any, releasedDateKey: string) => {
    const key = buildBookingKey(cls.name, releasedDateKey);
    const waitlistSnap = await get(ref(db, `class_waitlist/${key}`));
    if (!waitlistSnap.exists()) return;
    const entries = Object.entries(waitlistSnap.val())
      .map(([uid, val]: [string, any]) => ({ uid, ...val }))
      .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
    if (entries.length === 0) return;
    const next = entries[0];
    await set(ref(db, `class_bookings/${key}/${next.uid}`), {
      name: next.name,
      email: next.email ?? "",
      bookedAt: Date.now(),
      promotedFromWaitlist: true,
    });
    await remove(ref(db, `class_waitlist/${key}/${next.uid}`));
    await push(ref(db, `users/${next.uid}/notifications`), {
      title: "🎉 Spot Available!",
      body: `A spot opened in ${cls.name} on ${releasedDateKey} at ${cls.time}. You've been booked in!`,
      type: "waitlist_promoted",
      read: false,
      createdAt: Date.now(),
    });
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancel = async (cls: any) => {
    if (isCancelWindowClosed(cls.time, selectedDate)) {
      toast(
        `Cancellations close ${CANCEL_CUTOFF_MINUTES} min before class`,
        "error",
      );
      return;
    }
    if (
      !confirm(
        `Cancel ${cls.name} on ${selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}?`,
      )
    )
      return;
    await set(ref(db, `class_bookings/${bKey(cls)}/${user.uid}`), null);
    await updateUser({
      ...user,
      bookings: user.bookings.filter(
        (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
      ),
    });
    await promoteFromWaitlist(cls, dateKey);
    toast("Booking cancelled.", "info");
  };

  // ── Waitlist ──────────────────────────────────────────────────────────────
  const joinWaitlist = async (cls: any) => {
    if (isOnWaitlist(cls))
      return toast("You're already on the waitlist", "error");
    setProcessingWaitlist(bKey(cls));
    try {
      await set(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`), {
        name: user.name,
        email: user.email ?? "",
        joinedAt: Date.now(),
      });
      toast(`Added to waitlist for ${cls.name} ✓`, "success");
    } catch {
      toast("Failed to join waitlist", "error");
    }
    setProcessingWaitlist(null);
  };

  const leaveWaitlist = async (cls: any) => {
    if (!confirm("Leave the waitlist for this class?")) return;
    await remove(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`));
    toast("Removed from waitlist", "info");
  };

  const displayDate = selectedDate.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const upcomingBookings = user.bookings
    .filter((b: any) => b.dateKey && parseDateKey(b.dateKey) >= today)
    .sort((a: any, bk: any) =>
      (a.dateKey || "").localeCompare(bk.dateKey || ""),
    );

  return (
    <div
      className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
    >
      <PageTitle
        sub={
          isMember
            ? "Book your classes below"
            : "Non-members pay per class · Upgrade to unlock unlimited bookings"
        }
      >
        Class <span className="text-primary">Booking</span>
      </PageTitle>

      {/* Non-member banner */}
      {!isMember && (
        <div
          className="mb-5 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{
            background: "hsl(20 100% 50% / 0.1)",
            border: "1px solid hsl(20 100% 50% / 0.3)",
          }}
        >
          <div>
            <div className="font-bold text-sm">💪 Pay per class</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Members book all classes · Non-members pay per session via
              PayFast.
            </div>
          </div>
          <button
            onClick={() => setPage?.("Packages")}
            className="px-4 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
            style={{ background: "hsl(20 100% 50%)", color: "#000" }}
          >
            Buy credits or upgrade →
          </button>
        </div>
      )}

      {/*
        ══════════════════════════════════════════════════════════════════
        TEMP — OCTIV FALLBACK BANNER (PayFast is currently broken)
        ══════════════════════════════════════════════════════════════════
        Boss (Siyabonga) asked for the Octiv booking link to be visible
        again on Class Booking while our PayFast integration is being
        fixed. Non-members can't reliably pay in-app right now, so this
        points them to Octiv as a stopgap.

        ONCE PAYFAST IS FIXED, DO THIS:
          1. Delete this whole banner block (between the TEMP markers).
          2. That's it — the normal in-app "Pay R__ →" button on each
             class card (via initiatePayFastForClass) already handles
             non-member payment once PayFast works again, no other
             changes needed.

        Do NOT delete the Octiv link on the Dashboard's DropInCard —
        that one is permanent, for trial/drop-in visitors who aren't
        registering as members at all.
        ══════════════════════════════════════════════════════════════════
      */}
      {!isMember && (
        <div
          className="mb-5 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
          style={{
            background: "hsl(175 80% 44% / 0.08)",
            border: "1px solid hsl(175 80% 44% / 0.3)",
          }}
        >
          <div>
            <div className="font-bold text-sm">
              ⚠️ Card payment temporarily unavailable
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              We're resolving an issue with our payment provider. In the
              meantime, please book &amp; pay for non-member classes via Octiv.
            </div>
          </div>
          <a
            href="https://app.octivfitness.com/schedule"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-xs font-bold no-underline"
            style={{ background: "hsl(175 80% 44%)", color: "#fff" }}
          >
            Book via Octiv →
          </a>
        </div>
      )}
      {/* ══════════════════ END TEMP OCTIV FALLBACK BANNER ══════════════════ */}

      <MiniCalendar
        selectedDate={selectedDate}
        onSelect={(d) => {
          setSelectedDate(d);
          setExpanded(null);
          setShowWhoBooked(null);
        }}
        bookedDates={bookedDates}
      />

      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <div className="font-bold text-base">{displayDate}</div>
          <div className="text-xs text-muted-foreground">
            {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}{" "}
            available
          </div>
        </div>
        {adminClasses.length > 0 && (
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Live schedule
          </div>
        )}
      </div>

      {/* Category legend */}
      <div className="flex gap-2 flex-wrap mb-4">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
          <div
            key={cat}
            className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: `${color}18`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: color }}
            />
            {cat}
          </div>
        ))}
      </div>

      {loadingClasses ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading classes…
        </div>
      ) : dayClasses.length === 0 ? (
        <div className="mk2-card flex flex-col items-center justify-center py-16 gap-3 text-center">
          <span className="text-4xl">🗓</span>
          <p className="font-bold text-sm">
            No classes scheduled for {dayName}
          </p>
          <p className="text-xs text-muted-foreground">
            Select another date or check back later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
          {dayClasses.map((cls, i) => {
            const color = CATEGORY_COLORS[cls.category] ?? "hsl(20 100% 50%)";
            const booked = isBooked(cls);
            const open = expanded === cls.name;
            const left = spotsLeft(cls);
            const full = left === 0 && !booked;
            const bookers = bookedList(cls);
            const showingWho = showWhoBooked === cls.name;
            const details = Array.isArray(cls.details) ? cls.details : [];
            const hasWod = String(cls.wod ?? "").trim().length > 0;
            const isPassed = isClassTimePassed(cls.time, selectedDate);
            const chargeable = isChargeable(cls);
            const onWaitlist = isOnWaitlist(cls);
            const wlCount = waitlistCount(cls);
            const wlPos = waitlistPosition(cls);
            const cancelBlocked =
              booked && isCancelWindowClosed(cls.time, selectedDate);
            const isProcessingWl = processingWaitlist === bKey(cls);

            const bookLabel = full
              ? "Class Full"
              : isPassed
                ? "Class Passed"
                : isMember
                  ? "Book"
                  : chargeable
                    ? `Pay R${Number(cls.price).toFixed(0)} →`
                    : "Book";

            const handleBook = async () => {
              if (isMember || !chargeable) {
                try {
                  // cast to any to bridge MK2User → UserProfile during migration
                  await bookClass(cls, dateKey, user as any, selectedDate);
                  const newBooking = {
                    ...cls,
                    dateKey,
                    date: dayName,
                    displayDate: selectedDate.toLocaleDateString("en-ZA", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    }),
                  };
                  const already = user.bookings.some(
                    (b: any) => b.name === cls.name && b.dateKey === dateKey,
                  );
                  if (!already)
                    await updateUser({
                      ...user,
                      bookings: [...user.bookings, newBooking],
                    });
                  logEvent("book_class", {
                    class_name: cls.name,
                    date: dateKey,
                  });
                  toast(`✓ ${cls.name} booked!`, "success");
                } catch (err: any) {
                  toast(
                    err?.userMessage ?? "Booking failed. Please try again.",
                    "error",
                  );
                }
              } else {
                // NOTE: this is the normal PayFast flow for chargeable
                // non-member classes. Once PayFast is fixed, this path
                // works as-is — nothing here needs to change.
                setProcessingPayment(true);
                try {
                  await initiatePayFastForClass(
                    cls,
                    dateKey,
                    user as any,
                    selectedDate,
                  );
                } catch (err: any) {
                  toast(
                    err?.userMessage ??
                      "Payment initiation failed. Please try again.",
                    "error",
                  );
                  setProcessingPayment(false);
                }
              }
            };

            return (
              <motion.div
                key={`${cls.name}_${i}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card border rounded-xl overflow-hidden"
                style={{
                  borderColor: open ? color : "hsl(var(--border))",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-display text-[17px] tracking-wide leading-tight">
                        {cls.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {cls.subtitle}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-2xl" style={{ color }}>
                        {cls.time}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${full ? "text-red-400" : "text-muted-foreground"}`}
                      >
                        {booked ? (
                          <span className="text-green-400">✓ You're in</span>
                        ) : full ? (
                          `FULL · ${wlCount} waiting`
                        ) : (
                          `${left}/${cls.spots} spots`
                        )}
                      </div>
                      {!isMember &&
                        !booked &&
                        !full &&
                        !isPassed &&
                        chargeable && (
                          <div
                            className="text-[11px] font-bold mt-1"
                            style={{ color }}
                          >
                            R{Number(cls.price).toFixed(0)}
                          </div>
                        )}
                      {isPassed && !booked && (
                        <div className="text-[10px] font-bold mt-1 text-red-400">
                          Class passed
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex gap-1.5 flex-wrap mb-2.5">
                    <Tag color={color}>{cls.category}</Tag>
                    {cls.intensity && (
                      <Tag color={intColor(cls.intensity)}>{cls.intensity}</Tag>
                    )}
                    {cls.duration && (
                      <Tag color="hsl(0 0% 35%)">⏱ {cls.duration}</Tag>
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground mb-2">
                    👤 {cls.trainer}
                  </div>

                  {/* Waitlist position */}
                  {onWaitlist && wlPos > 0 && (
                    <div
                      className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={{
                        background: "hsl(38 92% 44% / 0.12)",
                        color: "hsl(38 92% 44%)",
                        border: "1px solid hsl(38 92% 44% / 0.3)",
                      }}
                    >
                      ⏳ You're #{wlPos} on the waitlist
                    </div>
                  )}

                  {/* Cancel window closed warning */}
                  {cancelBlocked && (
                    <div
                      className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
                      style={{
                        background: "hsl(0 84% 51% / 0.10)",
                        color: "hsl(0 84% 51%)",
                        border: "1px solid hsl(0 84% 51% / 0.25)",
                      }}
                    >
                      🔒 Cancel window closed ({CANCEL_CUTOFF_MINUTES} min
                      before class)
                    </div>
                  )}

                  {hasWod && <WodPanel cls={cls} color={color} />}

                  {/* Actions */}
                  <div className="flex gap-2 items-center flex-wrap mt-3">
                    {booked ? (
                      <>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                          style={{
                            background: "hsl(142 72% 37% / 0.15)",
                            color: "hsl(142 72% 37%)",
                            border: "1px solid hsl(142 72% 37% / 0.3)",
                          }}
                        >
                          ✓ Booked
                        </span>
                        <Btn
                          variant="subtle"
                          size="sm"
                          onClick={() => cancel(cls)}
                          disabled={cancelBlocked}
                        >
                          {cancelBlocked ? "🔒 Locked" : "Cancel"}
                        </Btn>
                      </>
                    ) : onWaitlist ? (
                      <Btn
                        variant="subtle"
                        size="sm"
                        onClick={() => leaveWaitlist(cls)}
                        disabled={isProcessingWl}
                      >
                        Leave Waitlist
                      </Btn>
                    ) : full && !isPassed ? (
                      <Btn
                        variant="subtle"
                        size="sm"
                        onClick={() => joinWaitlist(cls)}
                        disabled={isProcessingWl}
                      >
                        {isProcessingWl ? "Joining…" : "⏳ Join Waitlist"}
                      </Btn>
                    ) : (
                      <Btn
                        variant={!full && !isPassed ? "primary" : "subtle"}
                        size="sm"
                        onClick={handleBook}
                        disabled={full || isPassed || processingPayment}
                      >
                        {processingPayment ? "Redirecting…" : bookLabel}
                      </Btn>
                    )}

                    {!hasWod && details.length > 0 && (
                      <button
                        onClick={() => setExpanded(open ? null : cls.name)}
                        className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors"
                      >
                        {open ? "▲ Less" : "▼ Details"}
                      </button>
                    )}

                    <button
                      onClick={() =>
                        setShowWhoBooked(showingWho ? null : cls.name)
                      }
                      className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors ml-auto"
                    >
                      👥 {bookedCount(cls)}
                      {wlCount > 0 ? ` · ⏳ ${wlCount}` : ""}
                    </button>
                  </div>
                </div>

                {/* Details panel */}
                {open && !hasWod && details.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="bg-secondary border-t border-border px-4 py-3"
                  >
                    <div
                      className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
                      style={{ color }}
                    >
                      What's Included
                    </div>
                    {details.map((d: string, di: number) => (
                      <div
                        key={di}
                        className="flex gap-2 mb-1 text-xs text-muted-foreground"
                      >
                        <span style={{ color }}>▸</span> {d}
                      </div>
                    ))}
                  </motion.div>
                )}

                {/* Who's booked panel */}
                <AnimatePresence>
                  {showingWho && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-background border-t px-4 py-3"
                      style={{ borderColor: `${color}40` }}
                    >
                      <div
                        className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
                        style={{ color }}
                      >
                        Booked ({bookers.length}/{cls.spots})
                      </div>
                      {bookers.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          No bookings yet — be first!
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {bookers.map((b: any, bi: number) => (
                            <div
                              key={bi}
                              className="flex items-center gap-2 text-xs"
                            >
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                                style={{ background: color }}
                              >
                                {b.name?.[0] ?? "?"}
                              </div>
                              <span className="font-medium">{b.name}</span>
                              {b.promotedFromWaitlist && (
                                <span className="text-[9px] text-amber-400 font-bold">
                                  ⏳→✓
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {wlCount > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div
                            className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5"
                            style={{ color: "hsl(38 92% 44%)" }}
                          >
                            Waitlist ({wlCount})
                          </div>
                          {Object.entries(classWaitlists[bKey(cls)] ?? {})
                            .map(([uid, val]: [string, any]) => ({
                              uid,
                              ...val,
                            }))
                            .sort(
                              (a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
                            )
                            .map((w, wi) => (
                              <div
                                key={wi}
                                className="flex items-center gap-2 text-xs mb-1"
                              >
                                <span className="text-[10px] text-muted-foreground font-bold w-4">
                                  {wi + 1}.
                                </span>
                                <div
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
                                  style={{ background: "hsl(38 92% 44%)" }}
                                >
                                  {w.name?.[0] ?? "?"}
                                </div>
                                <span className="font-medium">{w.name}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Upcoming bookings */}
      {upcomingBookings.length > 0 && (
        <div className="mk2-card mt-7">
          <div className="font-bold text-sm mb-3">
            Your Upcoming Bookings ({upcomingBookings.length})
          </div>
          {upcomingBookings.map((b: any, i: number) => {
            const bColor = CATEGORY_COLORS[b.category] ?? "hsl(20 100% 50%)";
            return (
              <div
                key={i}
                className="flex justify-between items-center px-3 py-2 rounded-lg mb-1.5 text-xs flex-wrap gap-1.5"
                style={{
                  background: `${bColor}10`,
                  border: `1px solid ${bColor}30`,
                }}
              >
                <span className="font-bold" style={{ color: bColor }}>
                  {b.name}
                </span>
                <span className="text-muted-foreground">
                  {b.displayDate || b.dateKey}
                </span>
                <span className="text-muted-foreground">
                  {b.time} · {b.trainer}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// import { useState, useEffect } from "react";
// import { useAuth } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { logEvent, db } from "@/lib/firebase";
// import { ref, onValue, set, push, get, remove } from "firebase/database";
// import { Btn } from "@/components/shared/Btn";
// import { Tag } from "@/components/shared/Tag";
// import { PageTitle } from "@/components/shared/PageTitle";
// import { bookClass, initiatePayFastForClass } from "@/lib/Bookingengine";
// import { motion, AnimatePresence } from "framer-motion";

// // ── Category colours ──────────────────────────────────────────────────────────
// export const CATEGORY_COLORS: Record<string, string> = {
//   Crossfit: "hsl(20 100% 50%)",
//   Gymnastics: "hsl(263 85% 58%)",
//   Strength: "hsl(38 92% 44%)",
//   "Olympic Lifting": "hsl(217 91% 53%)",
//   "Saturday Smasher": "hsl(142 72% 37%)",
// };

// const DAYS = [
//   "Monday",
//   "Tuesday",
//   "Wednesday",
//   "Thursday",
//   "Friday",
//   "Saturday",
//   "Sunday",
// ];
// const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// const MONTH_NAMES = [
//   "January",
//   "February",
//   "March",
//   "April",
//   "May",
//   "June",
//   "July",
//   "August",
//   "September",
//   "October",
//   "November",
//   "December",
// ];

// const CANCEL_CUTOFF_MINUTES = 60;

// const FALLBACK_CLASSES = [
//   {
//     name: "CrossFit WOD",
//     time: "05:30",
//     trainer: "Coach Marcus",
//     spots: 20,
//     subtitle: "Workout of the Day",
//     category: "Crossfit",
//     details: [
//       "Daily programmed WOD",
//       "Olympic lifting + gymnastics",
//       "Scaled options available",
//     ],
//     duration: "60 min",
//     intensity: "Very High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Strength Circuit",
//     time: "09:00",
//     trainer: "Coach Busi",
//     spots: 20,
//     subtitle: "Full-body resistance training",
//     category: "Strength",
//     details: [
//       "5 stations × 4 rounds",
//       "Barbell, dumbbell & bodyweight",
//       "Progressive overload",
//     ],
//     duration: "60 min",
//     intensity: "Medium–High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Gymnastics",
//     time: "10:00",
//     trainer: "Coach Nomsa",
//     spots: 20,
//     subtitle: "Movement & bodyweight skills",
//     category: "Gymnastics",
//     details: [
//       "Handstands & ring work",
//       "Pull-ups & muscle-ups",
//       "All skill levels welcome",
//     ],
//     duration: "60 min",
//     intensity: "Medium–High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Olympic Lifting",
//     time: "17:00",
//     trainer: "Coach Dlamini",
//     spots: 20,
//     subtitle: "Snatch & clean and jerk",
//     category: "Olympic Lifting",
//     details: [
//       "Technique-focused sessions",
//       "Progressive loading",
//       "Comp & scaled weights",
//     ],
//     duration: "60 min",
//     intensity: "High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Saturday Smasher",
//     time: "08:00",
//     trainer: "Coach Marcus",
//     spots: 20,
//     subtitle: "Weekend community WOD",
//     category: "Saturday Smasher",
//     details: [
//       "Partner & team workouts",
//       "Fun competitive format",
//       "All levels welcome",
//     ],
//     duration: "60 min",
//     intensity: "High",
//     price: 250,
//     chargeNonMembers: true,
//   },
// ];

// const intColor = (i: string) =>
//   i.includes("Very")
//     ? "hsl(0 84% 51%)"
//     : i.includes("High")
//       ? "hsl(20 100% 50%)"
//       : i.includes("Medium")
//         ? "hsl(38 92% 44%)"
//         : "hsl(142 72% 37%)";

// // ── Date helpers ──────────────────────────────────────────────────────────────
// export function formatDateKey(date: Date): string {
//   const y = date.getFullYear();
//   const m = String(date.getMonth() + 1).padStart(2, "0");
//   const d = String(date.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }
// export function parseDateKey(key: string): Date {
//   const [y, m, d] = key.split("-").map(Number);
//   return new Date(y, m - 1, d);
// }
// export function getDayName(date: Date): string {
//   return DAYS[[6, 0, 1, 2, 3, 4, 5][date.getDay()]];
// }
// export function safeKey(str: string): string {
//   return str.replace(/[^a-zA-Z0-9_-]/g, "_");
// }
// export function buildBookingKey(className: string, dateKey: string): string {
//   return `${safeKey(className)}_${dateKey}`;
// }

// // ── Time helpers ──────────────────────────────────────────────────────────────
// function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
//   const now = new Date();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const selected = new Date(selectedDate);
//   selected.setHours(0, 0, 0, 0);
//   if (selected.getTime() !== today.getTime()) return false;
//   const [h, mn] = classTime.split(":").map(Number);
//   return h < now.getHours() || (h === now.getHours() && mn < now.getMinutes());
// }

// function isCancelWindowClosed(classTime: string, classDate: Date): boolean {
//   const now = new Date();
//   const [h, mn] = classTime.split(":").map(Number);
//   const classStart = new Date(classDate);
//   classStart.setHours(h, mn, 0, 0);
//   const cutoff = new Date(
//     classStart.getTime() - CANCEL_CUTOFF_MINUTES * 60 * 1000,
//   );
//   return now >= cutoff;
// }

// // ── Mini Calendar ─────────────────────────────────────────────────────────────
// function MiniCalendar({
//   selectedDate,
//   onSelect,
//   bookedDates,
// }: {
//   selectedDate: Date;
//   onSelect: (d: Date) => void;
//   bookedDates: Set<string>;
// }) {
//   const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
//   const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const firstDay = new Date(viewYear, viewMonth, 1).getDay();
//   const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

//   const prevMonth = () => {
//     if (viewMonth === 0) {
//       setViewMonth(11);
//       setViewYear((y) => y - 1);
//     } else setViewMonth((m) => m - 1);
//   };
//   const nextMonth = () => {
//     if (viewMonth === 11) {
//       setViewMonth(0);
//       setViewYear((y) => y + 1);
//     } else setViewMonth((m) => m + 1);
//   };

//   const cells: (number | null)[] = [];
//   for (let i = 0; i < firstDay; i++) cells.push(null);
//   for (let d = 1; d <= daysInMonth; d++) cells.push(d);

//   return (
//     <div className="mk2-card mb-5" style={{ maxWidth: 320 }}>
//       <div className="flex items-center justify-between mb-2">
//         <button
//           onClick={prevMonth}
//           className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
//         >
//           ←
//         </button>
//         <span className="font-bold text-xs">
//           {MONTH_NAMES[viewMonth]} {viewYear}
//         </span>
//         <button
//           onClick={nextMonth}
//           className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
//         >
//           →
//         </button>
//       </div>
//       <div className="grid grid-cols-7 mb-0.5">
//         {DAY_NAMES.map((d) => (
//           <div
//             key={d}
//             className="text-center text-[9px] font-bold text-muted-foreground py-0.5"
//           >
//             {d}
//           </div>
//         ))}
//       </div>
//       <div className="grid grid-cols-7 gap-0.5">
//         {cells.map((day, i) => {
//           if (!day) return <div key={i} />;
//           const date = new Date(viewYear, viewMonth, day);
//           date.setHours(0, 0, 0, 0);
//           const key = formatDateKey(date);
//           const isPast = date < today;
//           const isToday = date.getTime() === today.getTime();
//           const isSel = formatDateKey(selectedDate) === key;
//           const hasBkg = bookedDates.has(key);
//           return (
//             <button
//               key={i}
//               onClick={() =>
//                 !isPast && onSelect(new Date(viewYear, viewMonth, day))
//               }
//               disabled={isPast}
//               className={[
//                 "relative w-full aspect-square rounded text-[11px] font-semibold transition-all flex flex-col items-center justify-center leading-none",
//                 isPast
//                   ? "opacity-20 cursor-not-allowed"
//                   : "cursor-pointer hover:bg-secondary",
//                 isSel ? "bg-orange-500 text-black" : "",
//                 isToday && !isSel
//                   ? "ring-1 ring-orange-500 text-orange-500"
//                   : "",
//               ].join(" ")}
//             >
//               {day}
//               {hasBkg && !isSel && (
//                 <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
//               )}
//             </button>
//           );
//         })}
//       </div>
//       <div className="flex gap-3 mt-2 text-[9px] text-muted-foreground">
//         <div className="flex items-center gap-1">
//           <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />{" "}
//           Booked
//         </div>
//         <div className="flex items-center gap-1">
//           <span className="w-3 h-3 rounded ring-1 ring-orange-500 inline-block" />{" "}
//           Today
//         </div>
//       </div>
//     </div>
//   );
// }

// // ── WOD Panel ─────────────────────────────────────────────────────────────────
// function WodPanel({ cls, color }: { cls: any; color: string }) {
//   const [open, setOpen] = useState(false);
//   const wod: string = String(cls.wod ?? "").trim();
//   if (!wod) return null;
//   const lines = wod.split("\n");

//   return (
//     <div className="mt-3 rounded-xl border border-border overflow-hidden">
//       <button
//         onClick={() => setOpen((o) => !o)}
//         className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary"
//         style={{
//           background: "hsl(var(--secondary))",
//           color,
//           border: "none",
//           cursor: "pointer",
//         }}
//       >
//         <span className="flex items-center gap-2">
//           <span>📋</span>
//           <span>View Today's WOD</span>
//         </span>
//         <span style={{ fontSize: 10, opacity: 0.7 }}>
//           {open ? "▲ Hide" : "▼ Show"}
//         </span>
//       </button>
//       <AnimatePresence>
//         {open && (
//           <motion.div
//             initial={{ height: 0, opacity: 0 }}
//             animate={{ height: "auto", opacity: 1 }}
//             exit={{ height: 0, opacity: 0 }}
//             transition={{ duration: 0.2 }}
//             style={{ overflow: "hidden" }}
//           >
//             <div className="px-3 pb-3 pt-2 text-xs leading-relaxed bg-background">
//               <div className="mb-2 pb-2 border-b border-border">
//                 <div className="font-bold text-sm">{cls.trainer}</div>
//                 <div className="text-[11px]" style={{ color }}>
//                   {cls.category}
//                 </div>
//               </div>
//               <div>
//                 {lines.map((line, i) => {
//                   const t = line.trim();
//                   if (!t) return <div key={i} className="h-1.5" />;
//                   const isPart = /^part\s/i.test(t);
//                   const isHeader =
//                     !isPart &&
//                     (t.endsWith(":") ||
//                       (t === t.toUpperCase() &&
//                         t.length < 40 &&
//                         /[A-Z]/.test(t)));
//                   const isWeight = /^(comp|scaled|beg|rx)\s*:/i.test(t);
//                   if (isPart)
//                     return (
//                       <div key={i} className="font-bold mt-2" style={{ color }}>
//                         {t}
//                       </div>
//                     );
//                   if (isHeader)
//                     return (
//                       <div key={i} className="font-bold text-foreground mt-1">
//                         {t}
//                       </div>
//                     );
//                   if (isWeight)
//                     return (
//                       <div
//                         key={i}
//                         className="text-[10px] text-muted-foreground italic"
//                       >
//                         {t}
//                       </div>
//                     );
//                   return (
//                     <div key={i} className="text-muted-foreground">
//                       {t}
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ── Main Component ────────────────────────────────────────────────────────────
// export function ClassBooking({ setPage }: { setPage?: (p: string) => void }) {
//   const { user, updateUser, toast } = useAuth();
//   const { isMobile } = useBreakpoint();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//   const [selectedDate, setSelectedDate] = useState<Date>(new Date(today));
//   const [expanded, setExpanded] = useState<string | null>(null);
//   const [showWhoBooked, setShowWhoBooked] = useState<string | null>(null);
//   const [classBookings, setClassBookings] = useState<
//     Record<string, Record<string, any>>
//   >({});
//   const [classWaitlists, setClassWaitlists] = useState<
//     Record<string, Record<string, any>>
//   >({});
//   const [adminClasses, setAdminClasses] = useState<any[]>([]);
//   const [loadingClasses, setLoadingClasses] = useState(true);
//   const [processingPayment, setProcessingPayment] = useState(false);
//   const [processingWaitlist, setProcessingWaitlist] = useState<string | null>(
//     null,
//   );

//   useEffect(() => {
//     return onValue(ref(db, "admin_classes"), (snap) => {
//       if (snap.exists()) {
//         const list = Object.entries(snap.val())
//           .map(([id, val]: [string, any]) => ({ id, ...val }))
//           .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
//         setAdminClasses(list);
//       } else setAdminClasses([]);
//       setLoadingClasses(false);
//     });
//   }, []);

//   useEffect(() => {
//     return onValue(ref(db, "class_bookings"), (snap) =>
//       setClassBookings(snap.val() ?? {}),
//     );
//   }, []);

//   useEffect(() => {
//     return onValue(ref(db, "class_waitlist"), (snap) =>
//       setClassWaitlists(snap.val() ?? {}),
//     );
//   }, []);

//   if (!user) return null;

//   const dateKey = formatDateKey(selectedDate);
//   const dayName = getDayName(selectedDate);
//   const CLASSES = adminClasses.length > 0 ? adminClasses : FALLBACK_CLASSES;

//   const dayClasses = CLASSES.filter((cls) => {
//     if (adminClasses.length > 0) {
//       if (cls.scheduleType === "date") return cls.specificDate === dateKey;
//       return cls.day === dayName;
//     }
//     return true;
//   });

//   const bKey = (cls: any) => buildBookingKey(cls.name, dateKey);
//   const isBooked = (cls: any) => !!classBookings[bKey(cls)]?.[user.uid];
//   const bookedCount = (cls: any) =>
//     Object.keys(classBookings[bKey(cls)] ?? {}).length;
//   const bookedList = (cls: any) =>
//     Object.values(classBookings[bKey(cls)] ?? {});
//   const spotsLeft = (cls: any) =>
//     Math.max(0, Number(cls.spots || 20) - bookedCount(cls));
//   const isOnWaitlist = (cls: any) => !!classWaitlists[bKey(cls)]?.[user.uid];
//   const waitlistCount = (cls: any) =>
//     Object.keys(classWaitlists[bKey(cls)] ?? {}).length;
//   const waitlistPosition = (cls: any) => {
//     const entries = Object.entries(classWaitlists[bKey(cls)] ?? {})
//       .map(([uid, val]: [string, any]) => ({
//         uid,
//         joinedAt: val.joinedAt ?? 0,
//       }))
//       .sort((a, b) => a.joinedAt - b.joinedAt);
//     const pos = entries.findIndex((e) => e.uid === user.uid);
//     return pos >= 0 ? pos + 1 : -1;
//   };

//   const bookedDates = new Set<string>(
//     user.bookings.map((b: any) => b.dateKey).filter(Boolean),
//   );
//   const isMember = user.membership !== "basic" && user.membership !== undefined;
//   const isChargeable = (cls: any) =>
//     Boolean(cls.chargeNonMembers) && Number(cls.price) > 0;

//   // ── Auto-promote first waitlist member ────────────────────────────────────
//   const promoteFromWaitlist = async (cls: any, releasedDateKey: string) => {
//     const key = buildBookingKey(cls.name, releasedDateKey);
//     const waitlistSnap = await get(ref(db, `class_waitlist/${key}`));
//     if (!waitlistSnap.exists()) return;
//     const entries = Object.entries(waitlistSnap.val())
//       .map(([uid, val]: [string, any]) => ({ uid, ...val }))
//       .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
//     if (entries.length === 0) return;
//     const next = entries[0];
//     await set(ref(db, `class_bookings/${key}/${next.uid}`), {
//       name: next.name,
//       email: next.email ?? "",
//       bookedAt: Date.now(),
//       promotedFromWaitlist: true,
//     });
//     await remove(ref(db, `class_waitlist/${key}/${next.uid}`));
//     await push(ref(db, `users/${next.uid}/notifications`), {
//       title: "🎉 Spot Available!",
//       body: `A spot opened in ${cls.name} on ${releasedDateKey} at ${cls.time}. You've been booked in!`,
//       type: "waitlist_promoted",
//       read: false,
//       createdAt: Date.now(),
//     });
//   };

//   // ── Cancel ────────────────────────────────────────────────────────────────
//   const cancel = async (cls: any) => {
//     if (isCancelWindowClosed(cls.time, selectedDate)) {
//       toast(
//         `Cancellations close ${CANCEL_CUTOFF_MINUTES} min before class`,
//         "error",
//       );
//       return;
//     }
//     if (
//       !confirm(
//         `Cancel ${cls.name} on ${selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}?`,
//       )
//     )
//       return;
//     await set(ref(db, `class_bookings/${bKey(cls)}/${user.uid}`), null);
//     await updateUser({
//       ...user,
//       bookings: user.bookings.filter(
//         (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
//       ),
//     });
//     await promoteFromWaitlist(cls, dateKey);
//     toast("Booking cancelled.", "info");
//   };

//   // ── Waitlist ──────────────────────────────────────────────────────────────
//   const joinWaitlist = async (cls: any) => {
//     if (isOnWaitlist(cls))
//       return toast("You're already on the waitlist", "error");
//     setProcessingWaitlist(bKey(cls));
//     try {
//       await set(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`), {
//         name: user.name,
//         email: user.email ?? "",
//         joinedAt: Date.now(),
//       });
//       toast(`Added to waitlist for ${cls.name} ✓`, "success");
//     } catch {
//       toast("Failed to join waitlist", "error");
//     }
//     setProcessingWaitlist(null);
//   };

//   const leaveWaitlist = async (cls: any) => {
//     if (!confirm("Leave the waitlist for this class?")) return;
//     await remove(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`));
//     toast("Removed from waitlist", "info");
//   };

//   const displayDate = selectedDate.toLocaleDateString("en-ZA", {
//     weekday: "long",
//     day: "numeric",
//     month: "long",
//     year: "numeric",
//   });

//   const upcomingBookings = user.bookings
//     .filter((b: any) => b.dateKey && parseDateKey(b.dateKey) >= today)
//     .sort((a: any, bk: any) =>
//       (a.dateKey || "").localeCompare(bk.dateKey || ""),
//     );

//   return (
//     <div
//       className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
//     >
//       <PageTitle
//         sub={
//           isMember
//             ? "Book your classes below"
//             : "Non-members pay per class · Upgrade to unlock unlimited bookings"
//         }
//       >
//         Class <span className="text-primary">Booking</span>
//       </PageTitle>

//       {/* Non-member banner */}
//       {!isMember && (
//         <div
//           className="mb-5 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
//           style={{
//             background: "hsl(20 100% 50% / 0.1)",
//             border: "1px solid hsl(20 100% 50% / 0.3)",
//           }}
//         >
//           <div>
//             <div className="font-bold text-sm">💪 Pay per class</div>
//             <div className="text-xs text-muted-foreground mt-0.5">
//               Members book all classes · Non-members pay per session via
//               PayFast.
//             </div>
//           </div>
//           <button
//             onClick={() => setPage?.("Packages")}
//             className="px-4 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
//             style={{ background: "hsl(20 100% 50%)", color: "#000" }}
//           >
//             Buy credits or upgrade →
//           </button>
//         </div>
//       )}

//       {/*
//         ══════════════════════════════════════════════════════════════════
//         TEMP — OCTIV FALLBACK BANNER (PayFast is currently broken)
//         ══════════════════════════════════════════════════════════════════
//         Boss (Siyabonga) asked for the Octiv booking link to be visible
//         again on Class Booking while our PayFast integration is being
//         fixed. Non-members can't reliably pay in-app right now, so this
//         points them to Octiv as a stopgap.

//         ONCE PAYFAST IS FIXED, DO THIS:
//           1. Delete this whole banner block (between the TEMP markers).
//           2. That's it — the normal in-app "Pay R__ →" button on each
//              class card (via initiatePayFastForClass) already handles
//              non-member payment once PayFast works again, no other
//              changes needed.

//         Do NOT delete the Octiv link on the Dashboard's DropInCard —
//         that one is permanent, for trial/drop-in visitors who aren't
//         registering as members at all.
//         ══════════════════════════════════════════════════════════════════
//       */}
//       {!isMember && (
//         <div
//           className="mb-5 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
//           style={{
//             background: "hsl(175 80% 44% / 0.08)",
//             border: "1px solid hsl(175 80% 44% / 0.3)",
//           }}
//         >
//           <div>
//             <div className="font-bold text-sm">
//               ⚠️ Card payment temporarily unavailable
//             </div>
//             <div className="text-xs text-muted-foreground mt-0.5">
//               We're resolving an issue with our payment provider. In the
//               meantime, please book &amp; pay for non-member classes via
//               Octiv.
//             </div>
//           </div>
//           <a
//             href="https://app.octivfitness.com/schedule"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="px-4 py-2 rounded-lg text-xs font-bold no-underline"
//             style={{ background: "hsl(175 80% 44%)", color: "#fff" }}
//           >
//             Book via Octiv →
//           </a>
//         </div>
//       )}
//       {/* ══════════════════ END TEMP OCTIV FALLBACK BANNER ══════════════════ */}

//       <MiniCalendar
//         selectedDate={selectedDate}
//         onSelect={(d) => {
//           setSelectedDate(d);
//           setExpanded(null);
//           setShowWhoBooked(null);
//         }}
//         bookedDates={bookedDates}
//       />

//       <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
//         <div>
//           <div className="font-bold text-base">{displayDate}</div>
//           <div className="text-xs text-muted-foreground">
//             {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}{" "}
//             available
//           </div>
//         </div>
//         {adminClasses.length > 0 && (
//           <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
//             <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
//             Live schedule
//           </div>
//         )}
//       </div>

//       {/* Category legend */}
//       <div className="flex gap-2 flex-wrap mb-4">
//         {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
//           <div
//             key={cat}
//             className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
//             style={{
//               background: `${color}18`,
//               color,
//               border: `1px solid ${color}40`,
//             }}
//           >
//             <span
//               className="w-2 h-2 rounded-full inline-block"
//               style={{ background: color }}
//             />
//             {cat}
//           </div>
//         ))}
//       </div>

//       {loadingClasses ? (
//         <div className="text-center py-12 text-muted-foreground text-sm">
//           Loading classes…
//         </div>
//       ) : dayClasses.length === 0 ? (
//         <div className="mk2-card flex flex-col items-center justify-center py-16 gap-3 text-center">
//           <span className="text-4xl">🗓</span>
//           <p className="font-bold text-sm">
//             No classes scheduled for {dayName}
//           </p>
//           <p className="text-xs text-muted-foreground">
//             Select another date or check back later.
//           </p>
//         </div>
//       ) : (
//         <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
//           {dayClasses.map((cls, i) => {
//             const color = CATEGORY_COLORS[cls.category] ?? "hsl(20 100% 50%)";
//             const booked = isBooked(cls);
//             const open = expanded === cls.name;
//             const left = spotsLeft(cls);
//             const full = left === 0 && !booked;
//             const bookers = bookedList(cls);
//             const showingWho = showWhoBooked === cls.name;
//             const details = Array.isArray(cls.details) ? cls.details : [];
//             const hasWod = String(cls.wod ?? "").trim().length > 0;
//             const isPassed = isClassTimePassed(cls.time, selectedDate);
//             const chargeable = isChargeable(cls);
//             const onWaitlist = isOnWaitlist(cls);
//             const wlCount = waitlistCount(cls);
//             const wlPos = waitlistPosition(cls);
//             const cancelBlocked =
//               booked && isCancelWindowClosed(cls.time, selectedDate);
//             const isProcessingWl = processingWaitlist === bKey(cls);

//             const bookLabel = full
//               ? "Class Full"
//               : isPassed
//                 ? "Class Passed"
//                 : isMember
//                   ? "Book"
//                   : chargeable
//                     ? `Pay R${Number(cls.price).toFixed(0)} →`
//                     : "Book";

//             const handleBook = async () => {
//               if (isMember || !chargeable) {
//                 try {
//                   // cast to any to bridge MK2User → UserProfile during migration
//                   await bookClass(cls, dateKey, user as any, selectedDate);
//                   const newBooking = {
//                     ...cls,
//                     dateKey,
//                     date: dayName,
//                     displayDate: selectedDate.toLocaleDateString("en-ZA", {
//                       weekday: "short",
//                       day: "numeric",
//                       month: "short",
//                     }),
//                   };
//                   const already = user.bookings.some(
//                     (b: any) => b.name === cls.name && b.dateKey === dateKey,
//                   );
//                   if (!already)
//                     await updateUser({
//                       ...user,
//                       bookings: [...user.bookings, newBooking],
//                     });
//                   logEvent("book_class", {
//                     class_name: cls.name,
//                     date: dateKey,
//                   });
//                   toast(`✓ ${cls.name} booked!`, "success");
//                 } catch (err: any) {
//                   toast(
//                     err?.userMessage ?? "Booking failed. Please try again.",
//                     "error",
//                   );
//                 }
//               } else {
//                 // NOTE: this is the normal PayFast flow for chargeable
//                 // non-member classes. Once PayFast is fixed, this path
//                 // works as-is — nothing here needs to change.
//                 setProcessingPayment(true);
//                 try {
//                   await initiatePayFastForClass(
//                     cls,
//                     dateKey,
//                     user as any,
//                     selectedDate,
//                   );
//                 } catch (err: any) {
//                   toast(
//                     err?.userMessage ??
//                       "Payment initiation failed. Please try again.",
//                     "error",
//                   );
//                   setProcessingPayment(false);
//                 }
//               }
//             };

//             return (
//               <motion.div
//                 key={`${cls.name}_${i}`}
//                 initial={{ opacity: 0, y: 10 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ delay: i * 0.05 }}
//                 className="bg-card border rounded-xl overflow-hidden"
//                 style={{
//                   borderColor: open ? color : "hsl(var(--border))",
//                   borderLeft: `3px solid ${color}`,
//                 }}
//               >
//                 <div className="p-4">
//                   {/* Header */}
//                   <div className="flex justify-between items-start mb-2">
//                     <div className="flex-1 min-w-0 pr-2">
//                       <div className="font-display text-[17px] tracking-wide leading-tight">
//                         {cls.name}
//                       </div>
//                       <div className="text-[11px] text-muted-foreground mt-0.5">
//                         {cls.subtitle}
//                       </div>
//                     </div>
//                     <div className="text-right shrink-0">
//                       <div className="font-display text-2xl" style={{ color }}>
//                         {cls.time}
//                       </div>
//                       <div
//                         className={`text-[10px] font-bold ${full ? "text-red-400" : "text-muted-foreground"}`}
//                       >
//                         {booked ? (
//                           <span className="text-green-400">✓ You're in</span>
//                         ) : full ? (
//                           `FULL · ${wlCount} waiting`
//                         ) : (
//                           `${left}/${cls.spots} spots`
//                         )}
//                       </div>
//                       {!isMember &&
//                         !booked &&
//                         !full &&
//                         !isPassed &&
//                         chargeable && (
//                           <div
//                             className="text-[11px] font-bold mt-1"
//                             style={{ color }}
//                           >
//                             R{Number(cls.price).toFixed(0)}
//                           </div>
//                         )}
//                       {isPassed && !booked && (
//                         <div className="text-[10px] font-bold mt-1 text-red-400">
//                           Class passed
//                         </div>
//                       )}
//                     </div>
//                   </div>

//                   {/* Tags */}
//                   <div className="flex gap-1.5 flex-wrap mb-2.5">
//                     <Tag color={color}>{cls.category}</Tag>
//                     {cls.intensity && (
//                       <Tag color={intColor(cls.intensity)}>{cls.intensity}</Tag>
//                     )}
//                     {cls.duration && (
//                       <Tag color="hsl(0 0% 35%)">⏱ {cls.duration}</Tag>
//                     )}
//                   </div>

//                   <div className="text-[11px] text-muted-foreground mb-2">
//                     👤 {cls.trainer}
//                   </div>

//                   {/* Waitlist position */}
//                   {onWaitlist && wlPos > 0 && (
//                     <div
//                       className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                       style={{
//                         background: "hsl(38 92% 44% / 0.12)",
//                         color: "hsl(38 92% 44%)",
//                         border: "1px solid hsl(38 92% 44% / 0.3)",
//                       }}
//                     >
//                       ⏳ You're #{wlPos} on the waitlist
//                     </div>
//                   )}

//                   {/* Cancel window closed warning */}
//                   {cancelBlocked && (
//                     <div
//                       className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                       style={{
//                         background: "hsl(0 84% 51% / 0.10)",
//                         color: "hsl(0 84% 51%)",
//                         border: "1px solid hsl(0 84% 51% / 0.25)",
//                       }}
//                     >
//                       🔒 Cancel window closed ({CANCEL_CUTOFF_MINUTES} min
//                       before class)
//                     </div>
//                   )}

//                   {hasWod && <WodPanel cls={cls} color={color} />}

//                   {/* Actions */}
//                   <div className="flex gap-2 items-center flex-wrap mt-3">
//                     {booked ? (
//                       <>
//                         <span
//                           className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
//                           style={{
//                             background: "hsl(142 72% 37% / 0.15)",
//                             color: "hsl(142 72% 37%)",
//                             border: "1px solid hsl(142 72% 37% / 0.3)",
//                           }}
//                         >
//                           ✓ Booked
//                         </span>
//                         <Btn
//                           variant="subtle"
//                           size="sm"
//                           onClick={() => cancel(cls)}
//                           disabled={cancelBlocked}
//                         >
//                           {cancelBlocked ? "🔒 Locked" : "Cancel"}
//                         </Btn>
//                       </>
//                     ) : onWaitlist ? (
//                       <Btn
//                         variant="subtle"
//                         size="sm"
//                         onClick={() => leaveWaitlist(cls)}
//                         disabled={isProcessingWl}
//                       >
//                         Leave Waitlist
//                       </Btn>
//                     ) : full && !isPassed ? (
//                       <Btn
//                         variant="subtle"
//                         size="sm"
//                         onClick={() => joinWaitlist(cls)}
//                         disabled={isProcessingWl}
//                       >
//                         {isProcessingWl ? "Joining…" : "⏳ Join Waitlist"}
//                       </Btn>
//                     ) : (
//                       <Btn
//                         variant={!full && !isPassed ? "primary" : "subtle"}
//                         size="sm"
//                         onClick={handleBook}
//                         disabled={full || isPassed || processingPayment}
//                       >
//                         {processingPayment ? "Redirecting…" : bookLabel}
//                       </Btn>
//                     )}

//                     {!hasWod && details.length > 0 && (
//                       <button
//                         onClick={() => setExpanded(open ? null : cls.name)}
//                         className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors"
//                       >
//                         {open ? "▲ Less" : "▼ Details"}
//                       </button>
//                     )}

//                     <button
//                       onClick={() =>
//                         setShowWhoBooked(showingWho ? null : cls.name)
//                       }
//                       className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors ml-auto"
//                     >
//                       👥 {bookedCount(cls)}
//                       {wlCount > 0 ? ` · ⏳ ${wlCount}` : ""}
//                     </button>
//                   </div>
//                 </div>

//                 {/* Details panel */}
//                 {open && !hasWod && details.length > 0 && (
//                   <motion.div
//                     initial={{ height: 0, opacity: 0 }}
//                     animate={{ height: "auto", opacity: 1 }}
//                     className="bg-secondary border-t border-border px-4 py-3"
//                   >
//                     <div
//                       className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
//                       style={{ color }}
//                     >
//                       What's Included
//                     </div>
//                     {details.map((d: string, di: number) => (
//                       <div
//                         key={di}
//                         className="flex gap-2 mb-1 text-xs text-muted-foreground"
//                       >
//                         <span style={{ color }}>▸</span> {d}
//                       </div>
//                     ))}
//                   </motion.div>
//                 )}

//                 {/* Who's booked panel */}
//                 <AnimatePresence>
//                   {showingWho && (
//                     <motion.div
//                       initial={{ height: 0, opacity: 0 }}
//                       animate={{ height: "auto", opacity: 1 }}
//                       exit={{ height: 0, opacity: 0 }}
//                       className="bg-background border-t px-4 py-3"
//                       style={{ borderColor: `${color}40` }}
//                     >
//                       <div
//                         className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
//                         style={{ color }}
//                       >
//                         Booked ({bookers.length}/{cls.spots})
//                       </div>
//                       {bookers.length === 0 ? (
//                         <div className="text-xs text-muted-foreground">
//                           No bookings yet — be first!
//                         </div>
//                       ) : (
//                         <div className="flex flex-col gap-1">
//                           {bookers.map((b: any, bi: number) => (
//                             <div
//                               key={bi}
//                               className="flex items-center gap-2 text-xs"
//                             >
//                               <div
//                                 className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
//                                 style={{ background: color }}
//                               >
//                                 {b.name?.[0] ?? "?"}
//                               </div>
//                               <span className="font-medium">{b.name}</span>
//                               {b.promotedFromWaitlist && (
//                                 <span className="text-[9px] text-amber-400 font-bold">
//                                   ⏳→✓
//                                 </span>
//                               )}
//                             </div>
//                           ))}
//                         </div>
//                       )}

//                       {wlCount > 0 && (
//                         <div className="mt-3 pt-3 border-t border-border">
//                           <div
//                             className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5"
//                             style={{ color: "hsl(38 92% 44%)" }}
//                           >
//                             Waitlist ({wlCount})
//                           </div>
//                           {Object.entries(classWaitlists[bKey(cls)] ?? {})
//                             .map(([uid, val]: [string, any]) => ({
//                               uid,
//                               ...val,
//                             }))
//                             .sort(
//                               (a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
//                             )
//                             .map((w, wi) => (
//                               <div
//                                 key={wi}
//                                 className="flex items-center gap-2 text-xs mb-1"
//                               >
//                                 <span className="text-[10px] text-muted-foreground font-bold w-4">
//                                   {wi + 1}.
//                                 </span>
//                                 <div
//                                   className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
//                                   style={{ background: "hsl(38 92% 44%)" }}
//                                 >
//                                   {w.name?.[0] ?? "?"}
//                                 </div>
//                                 <span className="font-medium">{w.name}</span>
//                               </div>
//                             ))}
//                         </div>
//                       )}
//                     </motion.div>
//                   )}
//                 </AnimatePresence>
//               </motion.div>
//             );
//           })}
//         </div>
//       )}

//       {/* Upcoming bookings */}
//       {upcomingBookings.length > 0 && (
//         <div className="mk2-card mt-7">
//           <div className="font-bold text-sm mb-3">
//             Your Upcoming Bookings ({upcomingBookings.length})
//           </div>
//           {upcomingBookings.map((b: any, i: number) => {
//             const bColor = CATEGORY_COLORS[b.category] ?? "hsl(20 100% 50%)";
//             return (
//               <div
//                 key={i}
//                 className="flex justify-between items-center px-3 py-2 rounded-lg mb-1.5 text-xs flex-wrap gap-1.5"
//                 style={{
//                   background: `${bColor}10`,
//                   border: `1px solid ${bColor}30`,
//                 }}
//               >
//                 <span className="font-bold" style={{ color: bColor }}>
//                   {b.name}
//                 </span>
//                 <span className="text-muted-foreground">
//                   {b.displayDate || b.dateKey}
//                 </span>
//                 <span className="text-muted-foreground">
//                   {b.time} · {b.trainer}
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }

// import { useState, useEffect } from "react";
// import { useAuth } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { logEvent, db } from "@/lib/firebase";
// import { ref, onValue, set, push, get, remove } from "firebase/database";
// import { Btn } from "@/components/shared/Btn";
// import { Tag } from "@/components/shared/Tag";
// import { PageTitle } from "@/components/shared/PageTitle";
// import { bookClass, initiatePayFastForClass } from "@/lib/Bookingengine";
// import { motion, AnimatePresence } from "framer-motion";

// // ── Category colours ──────────────────────────────────────────────────────────
// export const CATEGORY_COLORS: Record<string, string> = {
//   Crossfit: "hsl(20 100% 50%)",
//   Gymnastics: "hsl(263 85% 58%)",
//   Strength: "hsl(38 92% 44%)",
//   "Olympic Lifting": "hsl(217 91% 53%)",
//   "Saturday Smasher": "hsl(142 72% 37%)",
// };

// const DAYS = [
//   "Monday",
//   "Tuesday",
//   "Wednesday",
//   "Thursday",
//   "Friday",
//   "Saturday",
//   "Sunday",
// ];
// const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// const MONTH_NAMES = [
//   "January",
//   "February",
//   "March",
//   "April",
//   "May",
//   "June",
//   "July",
//   "August",
//   "September",
//   "October",
//   "November",
//   "December",
// ];

// const CANCEL_CUTOFF_MINUTES = 60;

// const FALLBACK_CLASSES = [
//   {
//     name: "CrossFit WOD",
//     time: "05:30",
//     trainer: "Coach Marcus",
//     spots: 20,
//     subtitle: "Workout of the Day",
//     category: "Crossfit",
//     details: [
//       "Daily programmed WOD",
//       "Olympic lifting + gymnastics",
//       "Scaled options available",
//     ],
//     duration: "60 min",
//     intensity: "Very High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Strength Circuit",
//     time: "09:00",
//     trainer: "Coach Busi",
//     spots: 20,
//     subtitle: "Full-body resistance training",
//     category: "Strength",
//     details: [
//       "5 stations × 4 rounds",
//       "Barbell, dumbbell & bodyweight",
//       "Progressive overload",
//     ],
//     duration: "60 min",
//     intensity: "Medium–High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Gymnastics",
//     time: "10:00",
//     trainer: "Coach Nomsa",
//     spots: 20,
//     subtitle: "Movement & bodyweight skills",
//     category: "Gymnastics",
//     details: [
//       "Handstands & ring work",
//       "Pull-ups & muscle-ups",
//       "All skill levels welcome",
//     ],
//     duration: "60 min",
//     intensity: "Medium–High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Olympic Lifting",
//     time: "17:00",
//     trainer: "Coach Dlamini",
//     spots: 20,
//     subtitle: "Snatch & clean and jerk",
//     category: "Olympic Lifting",
//     details: [
//       "Technique-focused sessions",
//       "Progressive loading",
//       "Comp & scaled weights",
//     ],
//     duration: "60 min",
//     intensity: "High",
//     price: 250,
//     chargeNonMembers: true,
//   },
//   {
//     name: "Saturday Smasher",
//     time: "08:00",
//     trainer: "Coach Marcus",
//     spots: 20,
//     subtitle: "Weekend community WOD",
//     category: "Saturday Smasher",
//     details: [
//       "Partner & team workouts",
//       "Fun competitive format",
//       "All levels welcome",
//     ],
//     duration: "60 min",
//     intensity: "High",
//     price: 250,
//     chargeNonMembers: true,
//   },
// ];

// const intColor = (i: string) =>
//   i.includes("Very")
//     ? "hsl(0 84% 51%)"
//     : i.includes("High")
//       ? "hsl(20 100% 50%)"
//       : i.includes("Medium")
//         ? "hsl(38 92% 44%)"
//         : "hsl(142 72% 37%)";

// // ── Date helpers ──────────────────────────────────────────────────────────────
// export function formatDateKey(date: Date): string {
//   const y = date.getFullYear();
//   const m = String(date.getMonth() + 1).padStart(2, "0");
//   const d = String(date.getDate()).padStart(2, "0");
//   return `${y}-${m}-${d}`;
// }
// export function parseDateKey(key: string): Date {
//   const [y, m, d] = key.split("-").map(Number);
//   return new Date(y, m - 1, d);
// }
// export function getDayName(date: Date): string {
//   return DAYS[[6, 0, 1, 2, 3, 4, 5][date.getDay()]];
// }
// export function safeKey(str: string): string {
//   return str.replace(/[^a-zA-Z0-9_-]/g, "_");
// }
// export function buildBookingKey(className: string, dateKey: string): string {
//   return `${safeKey(className)}_${dateKey}`;
// }

// // ── Time helpers ──────────────────────────────────────────────────────────────
// function isClassTimePassed(classTime: string, selectedDate: Date): boolean {
//   const now = new Date();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const selected = new Date(selectedDate);
//   selected.setHours(0, 0, 0, 0);
//   if (selected.getTime() !== today.getTime()) return false;
//   const [h, mn] = classTime.split(":").map(Number);
//   return h < now.getHours() || (h === now.getHours() && mn < now.getMinutes());
// }

// function isCancelWindowClosed(classTime: string, classDate: Date): boolean {
//   const now = new Date();
//   const [h, mn] = classTime.split(":").map(Number);
//   const classStart = new Date(classDate);
//   classStart.setHours(h, mn, 0, 0);
//   const cutoff = new Date(
//     classStart.getTime() - CANCEL_CUTOFF_MINUTES * 60 * 1000,
//   );
//   return now >= cutoff;
// }

// // ── Mini Calendar ─────────────────────────────────────────────────────────────
// function MiniCalendar({
//   selectedDate,
//   onSelect,
//   bookedDates,
// }: {
//   selectedDate: Date;
//   onSelect: (d: Date) => void;
//   bookedDates: Set<string>;
// }) {
//   const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
//   const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   const firstDay = new Date(viewYear, viewMonth, 1).getDay();
//   const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

//   const prevMonth = () => {
//     if (viewMonth === 0) {
//       setViewMonth(11);
//       setViewYear((y) => y - 1);
//     } else setViewMonth((m) => m - 1);
//   };
//   const nextMonth = () => {
//     if (viewMonth === 11) {
//       setViewMonth(0);
//       setViewYear((y) => y + 1);
//     } else setViewMonth((m) => m + 1);
//   };

//   const cells: (number | null)[] = [];
//   for (let i = 0; i < firstDay; i++) cells.push(null);
//   for (let d = 1; d <= daysInMonth; d++) cells.push(d);

//   return (
//     <div className="mk2-card mb-5" style={{ maxWidth: 320 }}>
//       <div className="flex items-center justify-between mb-2">
//         <button
//           onClick={prevMonth}
//           className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
//         >
//           ←
//         </button>
//         <span className="font-bold text-xs">
//           {MONTH_NAMES[viewMonth]} {viewYear}
//         </span>
//         <button
//           onClick={nextMonth}
//           className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded transition-colors"
//         >
//           →
//         </button>
//       </div>
//       <div className="grid grid-cols-7 mb-0.5">
//         {DAY_NAMES.map((d) => (
//           <div
//             key={d}
//             className="text-center text-[9px] font-bold text-muted-foreground py-0.5"
//           >
//             {d}
//           </div>
//         ))}
//       </div>
//       <div className="grid grid-cols-7 gap-0.5">
//         {cells.map((day, i) => {
//           if (!day) return <div key={i} />;
//           const date = new Date(viewYear, viewMonth, day);
//           date.setHours(0, 0, 0, 0);
//           const key = formatDateKey(date);
//           const isPast = date < today;
//           const isToday = date.getTime() === today.getTime();
//           const isSel = formatDateKey(selectedDate) === key;
//           const hasBkg = bookedDates.has(key);
//           return (
//             <button
//               key={i}
//               onClick={() =>
//                 !isPast && onSelect(new Date(viewYear, viewMonth, day))
//               }
//               disabled={isPast}
//               className={[
//                 "relative w-full aspect-square rounded text-[11px] font-semibold transition-all flex flex-col items-center justify-center leading-none",
//                 isPast
//                   ? "opacity-20 cursor-not-allowed"
//                   : "cursor-pointer hover:bg-secondary",
//                 isSel ? "bg-orange-500 text-black" : "",
//                 isToday && !isSel
//                   ? "ring-1 ring-orange-500 text-orange-500"
//                   : "",
//               ].join(" ")}
//             >
//               {day}
//               {hasBkg && !isSel && (
//                 <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
//               )}
//             </button>
//           );
//         })}
//       </div>
//       <div className="flex gap-3 mt-2 text-[9px] text-muted-foreground">
//         <div className="flex items-center gap-1">
//           <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />{" "}
//           Booked
//         </div>
//         <div className="flex items-center gap-1">
//           <span className="w-3 h-3 rounded ring-1 ring-orange-500 inline-block" />{" "}
//           Today
//         </div>
//       </div>
//     </div>
//   );
// }

// // ── WOD Panel ─────────────────────────────────────────────────────────────────
// function WodPanel({ cls, color }: { cls: any; color: string }) {
//   const [open, setOpen] = useState(false);
//   const wod: string = String(cls.wod ?? "").trim();
//   if (!wod) return null;
//   const lines = wod.split("\n");

//   return (
//     <div className="mt-3 rounded-xl border border-border overflow-hidden">
//       <button
//         onClick={() => setOpen((o) => !o)}
//         className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary"
//         style={{
//           background: "hsl(var(--secondary))",
//           color,
//           border: "none",
//           cursor: "pointer",
//         }}
//       >
//         <span className="flex items-center gap-2">
//           <span>📋</span>
//           <span>View Today's WOD</span>
//         </span>
//         <span style={{ fontSize: 10, opacity: 0.7 }}>
//           {open ? "▲ Hide" : "▼ Show"}
//         </span>
//       </button>
//       <AnimatePresence>
//         {open && (
//           <motion.div
//             initial={{ height: 0, opacity: 0 }}
//             animate={{ height: "auto", opacity: 1 }}
//             exit={{ height: 0, opacity: 0 }}
//             transition={{ duration: 0.2 }}
//             style={{ overflow: "hidden" }}
//           >
//             <div className="px-3 pb-3 pt-2 text-xs leading-relaxed bg-background">
//               <div className="mb-2 pb-2 border-b border-border">
//                 <div className="font-bold text-sm">{cls.trainer}</div>
//                 <div className="text-[11px]" style={{ color }}>
//                   {cls.category}
//                 </div>
//               </div>
//               <div>
//                 {lines.map((line, i) => {
//                   const t = line.trim();
//                   if (!t) return <div key={i} className="h-1.5" />;
//                   const isPart = /^part\s/i.test(t);
//                   const isHeader =
//                     !isPart &&
//                     (t.endsWith(":") ||
//                       (t === t.toUpperCase() &&
//                         t.length < 40 &&
//                         /[A-Z]/.test(t)));
//                   const isWeight = /^(comp|scaled|beg|rx)\s*:/i.test(t);
//                   if (isPart)
//                     return (
//                       <div key={i} className="font-bold mt-2" style={{ color }}>
//                         {t}
//                       </div>
//                     );
//                   if (isHeader)
//                     return (
//                       <div key={i} className="font-bold text-foreground mt-1">
//                         {t}
//                       </div>
//                     );
//                   if (isWeight)
//                     return (
//                       <div
//                         key={i}
//                         className="text-[10px] text-muted-foreground italic"
//                       >
//                         {t}
//                       </div>
//                     );
//                   return (
//                     <div key={i} className="text-muted-foreground">
//                       {t}
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// // ── Main Component ────────────────────────────────────────────────────────────
// export function ClassBooking({ setPage }: { setPage?: (p: string) => void }) {
//   const { user, updateUser, toast } = useAuth();
//   const { isMobile } = useBreakpoint();
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);

//   const [selectedDate, setSelectedDate] = useState<Date>(new Date(today));
//   const [expanded, setExpanded] = useState<string | null>(null);
//   const [showWhoBooked, setShowWhoBooked] = useState<string | null>(null);
//   const [classBookings, setClassBookings] = useState<
//     Record<string, Record<string, any>>
//   >({});
//   const [classWaitlists, setClassWaitlists] = useState<
//     Record<string, Record<string, any>>
//   >({});
//   const [adminClasses, setAdminClasses] = useState<any[]>([]);
//   const [loadingClasses, setLoadingClasses] = useState(true);
//   const [processingPayment, setProcessingPayment] = useState(false);
//   const [processingWaitlist, setProcessingWaitlist] = useState<string | null>(
//     null,
//   );

//   useEffect(() => {
//     return onValue(ref(db, "admin_classes"), (snap) => {
//       if (snap.exists()) {
//         const list = Object.entries(snap.val())
//           .map(([id, val]: [string, any]) => ({ id, ...val }))
//           .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
//         setAdminClasses(list);
//       } else setAdminClasses([]);
//       setLoadingClasses(false);
//     });
//   }, []);

//   useEffect(() => {
//     return onValue(ref(db, "class_bookings"), (snap) =>
//       setClassBookings(snap.val() ?? {}),
//     );
//   }, []);

//   useEffect(() => {
//     return onValue(ref(db, "class_waitlist"), (snap) =>
//       setClassWaitlists(snap.val() ?? {}),
//     );
//   }, []);

//   if (!user) return null;

//   const dateKey = formatDateKey(selectedDate);
//   const dayName = getDayName(selectedDate);
//   const CLASSES = adminClasses.length > 0 ? adminClasses : FALLBACK_CLASSES;

//   const dayClasses = CLASSES.filter((cls) => {
//     if (adminClasses.length > 0) {
//       if (cls.scheduleType === "date") return cls.specificDate === dateKey;
//       return cls.day === dayName;
//     }
//     return true;
//   });

//   const bKey = (cls: any) => buildBookingKey(cls.name, dateKey);
//   const isBooked = (cls: any) => !!classBookings[bKey(cls)]?.[user.uid];
//   const bookedCount = (cls: any) =>
//     Object.keys(classBookings[bKey(cls)] ?? {}).length;
//   const bookedList = (cls: any) =>
//     Object.values(classBookings[bKey(cls)] ?? {});
//   const spotsLeft = (cls: any) =>
//     Math.max(0, Number(cls.spots || 20) - bookedCount(cls));
//   const isOnWaitlist = (cls: any) => !!classWaitlists[bKey(cls)]?.[user.uid];
//   const waitlistCount = (cls: any) =>
//     Object.keys(classWaitlists[bKey(cls)] ?? {}).length;
//   const waitlistPosition = (cls: any) => {
//     const entries = Object.entries(classWaitlists[bKey(cls)] ?? {})
//       .map(([uid, val]: [string, any]) => ({
//         uid,
//         joinedAt: val.joinedAt ?? 0,
//       }))
//       .sort((a, b) => a.joinedAt - b.joinedAt);
//     const pos = entries.findIndex((e) => e.uid === user.uid);
//     return pos >= 0 ? pos + 1 : -1;
//   };

//   const bookedDates = new Set<string>(
//     user.bookings.map((b: any) => b.dateKey).filter(Boolean),
//   );
//   const isMember = user.membership !== "basic" && user.membership !== undefined;
//   const isChargeable = (cls: any) =>
//     Boolean(cls.chargeNonMembers) && Number(cls.price) > 0;

//   // ── Auto-promote first waitlist member ────────────────────────────────────
//   const promoteFromWaitlist = async (cls: any, releasedDateKey: string) => {
//     const key = buildBookingKey(cls.name, releasedDateKey);
//     const waitlistSnap = await get(ref(db, `class_waitlist/${key}`));
//     if (!waitlistSnap.exists()) return;
//     const entries = Object.entries(waitlistSnap.val())
//       .map(([uid, val]: [string, any]) => ({ uid, ...val }))
//       .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
//     if (entries.length === 0) return;
//     const next = entries[0];
//     await set(ref(db, `class_bookings/${key}/${next.uid}`), {
//       name: next.name,
//       email: next.email ?? "",
//       bookedAt: Date.now(),
//       promotedFromWaitlist: true,
//     });
//     await remove(ref(db, `class_waitlist/${key}/${next.uid}`));
//     await push(ref(db, `users/${next.uid}/notifications`), {
//       title: "🎉 Spot Available!",
//       body: `A spot opened in ${cls.name} on ${releasedDateKey} at ${cls.time}. You've been booked in!`,
//       type: "waitlist_promoted",
//       read: false,
//       createdAt: Date.now(),
//     });
//   };

//   // ── Cancel ────────────────────────────────────────────────────────────────
//   const cancel = async (cls: any) => {
//     if (isCancelWindowClosed(cls.time, selectedDate)) {
//       toast(
//         `Cancellations close ${CANCEL_CUTOFF_MINUTES} min before class`,
//         "error",
//       );
//       return;
//     }
//     if (
//       !confirm(
//         `Cancel ${cls.name} on ${selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}?`,
//       )
//     )
//       return;
//     await set(ref(db, `class_bookings/${bKey(cls)}/${user.uid}`), null);
//     await updateUser({
//       ...user,
//       bookings: user.bookings.filter(
//         (b: any) => !(b.name === cls.name && b.dateKey === dateKey),
//       ),
//     });
//     await promoteFromWaitlist(cls, dateKey);
//     toast("Booking cancelled.", "info");
//   };

//   // ── Waitlist ──────────────────────────────────────────────────────────────
//   const joinWaitlist = async (cls: any) => {
//     if (isOnWaitlist(cls))
//       return toast("You're already on the waitlist", "error");
//     setProcessingWaitlist(bKey(cls));
//     try {
//       await set(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`), {
//         name: user.name,
//         email: user.email ?? "",
//         joinedAt: Date.now(),
//       });
//       toast(`Added to waitlist for ${cls.name} ✓`, "success");
//     } catch {
//       toast("Failed to join waitlist", "error");
//     }
//     setProcessingWaitlist(null);
//   };

//   const leaveWaitlist = async (cls: any) => {
//     if (!confirm("Leave the waitlist for this class?")) return;
//     await remove(ref(db, `class_waitlist/${bKey(cls)}/${user.uid}`));
//     toast("Removed from waitlist", "info");
//   };

//   const displayDate = selectedDate.toLocaleDateString("en-ZA", {
//     weekday: "long",
//     day: "numeric",
//     month: "long",
//     year: "numeric",
//   });

//   const upcomingBookings = user.bookings
//     .filter((b: any) => b.dateKey && parseDateKey(b.dateKey) >= today)
//     .sort((a: any, bk: any) =>
//       (a.dateKey || "").localeCompare(bk.dateKey || ""),
//     );

//   return (
//     <div
//       className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
//     >
//       <PageTitle
//         sub={
//           isMember
//             ? "Book your classes below"
//             : "Non-members pay per class · Upgrade to unlock unlimited bookings"
//         }
//       >
//         Class <span className="text-primary">Booking</span>
//       </PageTitle>

//       {/* Non-member banner */}
//       {!isMember && (
//         <div
//           className="mb-5 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
//           style={{
//             background: "hsl(20 100% 50% / 0.1)",
//             border: "1px solid hsl(20 100% 50% / 0.3)",
//           }}
//         >
//           <div>
//             <div className="font-bold text-sm">💪 Pay per class</div>
//             <div className="text-xs text-muted-foreground mt-0.5">
//               Members book all classes · Non-members pay per session via
//               PayFast.
//             </div>
//           </div>
//           <button
//             onClick={() => setPage?.("Packages")}
//             className="px-4 py-2 rounded-lg text-xs font-bold border-none cursor-pointer"
//             style={{ background: "hsl(20 100% 50%)", color: "#000" }}
//           >
//             Buy credits or upgrade →
//           </button>
//         </div>
//       )}

//       <MiniCalendar
//         selectedDate={selectedDate}
//         onSelect={(d) => {
//           setSelectedDate(d);
//           setExpanded(null);
//           setShowWhoBooked(null);
//         }}
//         bookedDates={bookedDates}
//       />

//       <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
//         <div>
//           <div className="font-bold text-base">{displayDate}</div>
//           <div className="text-xs text-muted-foreground">
//             {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}{" "}
//             available
//           </div>
//         </div>
//         {adminClasses.length > 0 && (
//           <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
//             <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
//             Live schedule
//           </div>
//         )}
//       </div>

//       {/* Category legend */}
//       <div className="flex gap-2 flex-wrap mb-4">
//         {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
//           <div
//             key={cat}
//             className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
//             style={{
//               background: `${color}18`,
//               color,
//               border: `1px solid ${color}40`,
//             }}
//           >
//             <span
//               className="w-2 h-2 rounded-full inline-block"
//               style={{ background: color }}
//             />
//             {cat}
//           </div>
//         ))}
//       </div>

//       {loadingClasses ? (
//         <div className="text-center py-12 text-muted-foreground text-sm">
//           Loading classes…
//         </div>
//       ) : dayClasses.length === 0 ? (
//         <div className="mk2-card flex flex-col items-center justify-center py-16 gap-3 text-center">
//           <span className="text-4xl">🗓</span>
//           <p className="font-bold text-sm">
//             No classes scheduled for {dayName}
//           </p>
//           <p className="text-xs text-muted-foreground">
//             Select another date or check back later.
//           </p>
//         </div>
//       ) : (
//         <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
//           {dayClasses.map((cls, i) => {
//             const color = CATEGORY_COLORS[cls.category] ?? "hsl(20 100% 50%)";
//             const booked = isBooked(cls);
//             const open = expanded === cls.name;
//             const left = spotsLeft(cls);
//             const full = left === 0 && !booked;
//             const bookers = bookedList(cls);
//             const showingWho = showWhoBooked === cls.name;
//             const details = Array.isArray(cls.details) ? cls.details : [];
//             const hasWod = String(cls.wod ?? "").trim().length > 0;
//             const isPassed = isClassTimePassed(cls.time, selectedDate);
//             const chargeable = isChargeable(cls);
//             const onWaitlist = isOnWaitlist(cls);
//             const wlCount = waitlistCount(cls);
//             const wlPos = waitlistPosition(cls);
//             const cancelBlocked =
//               booked && isCancelWindowClosed(cls.time, selectedDate);
//             const isProcessingWl = processingWaitlist === bKey(cls);

//             const bookLabel = full
//               ? "Class Full"
//               : isPassed
//                 ? "Class Passed"
//                 : isMember
//                   ? "Book"
//                   : chargeable
//                     ? `Pay R${Number(cls.price).toFixed(0)} →`
//                     : "Book";

//             const handleBook = async () => {
//               if (isMember || !chargeable) {
//                 try {
//                   // cast to any to bridge MK2User → UserProfile during migration
//                   await bookClass(cls, dateKey, user as any, selectedDate);
//                   const newBooking = {
//                     ...cls,
//                     dateKey,
//                     date: dayName,
//                     displayDate: selectedDate.toLocaleDateString("en-ZA", {
//                       weekday: "short",
//                       day: "numeric",
//                       month: "short",
//                     }),
//                   };
//                   const already = user.bookings.some(
//                     (b: any) => b.name === cls.name && b.dateKey === dateKey,
//                   );
//                   if (!already)
//                     await updateUser({
//                       ...user,
//                       bookings: [...user.bookings, newBooking],
//                     });
//                   logEvent("book_class", {
//                     class_name: cls.name,
//                     date: dateKey,
//                   });
//                   toast(`✓ ${cls.name} booked!`, "success");
//                 } catch (err: any) {
//                   toast(
//                     err?.userMessage ?? "Booking failed. Please try again.",
//                     "error",
//                   );
//                 }
//               } else {
//                 setProcessingPayment(true);
//                 try {
//                   await initiatePayFastForClass(
//                     cls,
//                     dateKey,
//                     user as any,
//                     selectedDate,
//                   );
//                 } catch (err: any) {
//                   toast(
//                     err?.userMessage ??
//                       "Payment initiation failed. Please try again.",
//                     "error",
//                   );
//                   setProcessingPayment(false);
//                 }
//               }
//             };

//             return (
//               <motion.div
//                 key={`${cls.name}_${i}`}
//                 initial={{ opacity: 0, y: 10 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ delay: i * 0.05 }}
//                 className="bg-card border rounded-xl overflow-hidden"
//                 style={{
//                   borderColor: open ? color : "hsl(var(--border))",
//                   borderLeft: `3px solid ${color}`,
//                 }}
//               >
//                 <div className="p-4">
//                   {/* Header */}
//                   <div className="flex justify-between items-start mb-2">
//                     <div className="flex-1 min-w-0 pr-2">
//                       <div className="font-display text-[17px] tracking-wide leading-tight">
//                         {cls.name}
//                       </div>
//                       <div className="text-[11px] text-muted-foreground mt-0.5">
//                         {cls.subtitle}
//                       </div>
//                     </div>
//                     <div className="text-right shrink-0">
//                       <div className="font-display text-2xl" style={{ color }}>
//                         {cls.time}
//                       </div>
//                       <div
//                         className={`text-[10px] font-bold ${full ? "text-red-400" : "text-muted-foreground"}`}
//                       >
//                         {booked ? (
//                           <span className="text-green-400">✓ You're in</span>
//                         ) : full ? (
//                           `FULL · ${wlCount} waiting`
//                         ) : (
//                           `${left}/${cls.spots} spots`
//                         )}
//                       </div>
//                       {!isMember &&
//                         !booked &&
//                         !full &&
//                         !isPassed &&
//                         chargeable && (
//                           <div
//                             className="text-[11px] font-bold mt-1"
//                             style={{ color }}
//                           >
//                             R{Number(cls.price).toFixed(0)}
//                           </div>
//                         )}
//                       {isPassed && !booked && (
//                         <div className="text-[10px] font-bold mt-1 text-red-400">
//                           Class passed
//                         </div>
//                       )}
//                     </div>
//                   </div>

//                   {/* Tags */}
//                   <div className="flex gap-1.5 flex-wrap mb-2.5">
//                     <Tag color={color}>{cls.category}</Tag>
//                     {cls.intensity && (
//                       <Tag color={intColor(cls.intensity)}>{cls.intensity}</Tag>
//                     )}
//                     {cls.duration && (
//                       <Tag color="hsl(0 0% 35%)">⏱ {cls.duration}</Tag>
//                     )}
//                   </div>

//                   <div className="text-[11px] text-muted-foreground mb-2">
//                     👤 {cls.trainer}
//                   </div>

//                   {/* Waitlist position */}
//                   {onWaitlist && wlPos > 0 && (
//                     <div
//                       className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                       style={{
//                         background: "hsl(38 92% 44% / 0.12)",
//                         color: "hsl(38 92% 44%)",
//                         border: "1px solid hsl(38 92% 44% / 0.3)",
//                       }}
//                     >
//                       ⏳ You're #{wlPos} on the waitlist
//                     </div>
//                   )}

//                   {/* Cancel window closed warning */}
//                   {cancelBlocked && (
//                     <div
//                       className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                       style={{
//                         background: "hsl(0 84% 51% / 0.10)",
//                         color: "hsl(0 84% 51%)",
//                         border: "1px solid hsl(0 84% 51% / 0.25)",
//                       }}
//                     >
//                       🔒 Cancel window closed ({CANCEL_CUTOFF_MINUTES} min
//                       before class)
//                     </div>
//                   )}

//                   {hasWod && <WodPanel cls={cls} color={color} />}

//                   {/* Actions */}
//                   <div className="flex gap-2 items-center flex-wrap mt-3">
//                     {booked ? (
//                       <>
//                         <span
//                           className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
//                           style={{
//                             background: "hsl(142 72% 37% / 0.15)",
//                             color: "hsl(142 72% 37%)",
//                             border: "1px solid hsl(142 72% 37% / 0.3)",
//                           }}
//                         >
//                           ✓ Booked
//                         </span>
//                         <Btn
//                           variant="subtle"
//                           size="sm"
//                           onClick={() => cancel(cls)}
//                           disabled={cancelBlocked}
//                         >
//                           {cancelBlocked ? "🔒 Locked" : "Cancel"}
//                         </Btn>
//                       </>
//                     ) : onWaitlist ? (
//                       <Btn
//                         variant="subtle"
//                         size="sm"
//                         onClick={() => leaveWaitlist(cls)}
//                         disabled={isProcessingWl}
//                       >
//                         Leave Waitlist
//                       </Btn>
//                     ) : full && !isPassed ? (
//                       <Btn
//                         variant="subtle"
//                         size="sm"
//                         onClick={() => joinWaitlist(cls)}
//                         disabled={isProcessingWl}
//                       >
//                         {isProcessingWl ? "Joining…" : "⏳ Join Waitlist"}
//                       </Btn>
//                     ) : (
//                       <Btn
//                         variant={!full && !isPassed ? "primary" : "subtle"}
//                         size="sm"
//                         onClick={handleBook}
//                         disabled={full || isPassed || processingPayment}
//                       >
//                         {processingPayment ? "Redirecting…" : bookLabel}
//                       </Btn>
//                     )}

//                     {!hasWod && details.length > 0 && (
//                       <button
//                         onClick={() => setExpanded(open ? null : cls.name)}
//                         className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors"
//                       >
//                         {open ? "▲ Less" : "▼ Details"}
//                       </button>
//                     )}

//                     <button
//                       onClick={() =>
//                         setShowWhoBooked(showingWho ? null : cls.name)
//                       }
//                       className="text-muted-foreground text-[11px] bg-transparent border-none cursor-pointer hover:text-foreground transition-colors ml-auto"
//                     >
//                       👥 {bookedCount(cls)}
//                       {wlCount > 0 ? ` · ⏳ ${wlCount}` : ""}
//                     </button>
//                   </div>
//                 </div>

//                 {/* Details panel */}
//                 {open && !hasWod && details.length > 0 && (
//                   <motion.div
//                     initial={{ height: 0, opacity: 0 }}
//                     animate={{ height: "auto", opacity: 1 }}
//                     className="bg-secondary border-t border-border px-4 py-3"
//                   >
//                     <div
//                       className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
//                       style={{ color }}
//                     >
//                       What's Included
//                     </div>
//                     {details.map((d: string, di: number) => (
//                       <div
//                         key={di}
//                         className="flex gap-2 mb-1 text-xs text-muted-foreground"
//                       >
//                         <span style={{ color }}>▸</span> {d}
//                       </div>
//                     ))}
//                   </motion.div>
//                 )}

//                 {/* Who's booked panel */}
//                 <AnimatePresence>
//                   {showingWho && (
//                     <motion.div
//                       initial={{ height: 0, opacity: 0 }}
//                       animate={{ height: "auto", opacity: 1 }}
//                       exit={{ height: 0, opacity: 0 }}
//                       className="bg-background border-t px-4 py-3"
//                       style={{ borderColor: `${color}40` }}
//                     >
//                       <div
//                         className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2"
//                         style={{ color }}
//                       >
//                         Booked ({bookers.length}/{cls.spots})
//                       </div>
//                       {bookers.length === 0 ? (
//                         <div className="text-xs text-muted-foreground">
//                           No bookings yet — be first!
//                         </div>
//                       ) : (
//                         <div className="flex flex-col gap-1">
//                           {bookers.map((b: any, bi: number) => (
//                             <div
//                               key={bi}
//                               className="flex items-center gap-2 text-xs"
//                             >
//                               <div
//                                 className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
//                                 style={{ background: color }}
//                               >
//                                 {b.name?.[0] ?? "?"}
//                               </div>
//                               <span className="font-medium">{b.name}</span>
//                               {b.promotedFromWaitlist && (
//                                 <span className="text-[9px] text-amber-400 font-bold">
//                                   ⏳→✓
//                                 </span>
//                               )}
//                             </div>
//                           ))}
//                         </div>
//                       )}

//                       {wlCount > 0 && (
//                         <div className="mt-3 pt-3 border-t border-border">
//                           <div
//                             className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5"
//                             style={{ color: "hsl(38 92% 44%)" }}
//                           >
//                             Waitlist ({wlCount})
//                           </div>
//                           {Object.entries(classWaitlists[bKey(cls)] ?? {})
//                             .map(([uid, val]: [string, any]) => ({
//                               uid,
//                               ...val,
//                             }))
//                             .sort(
//                               (a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
//                             )
//                             .map((w, wi) => (
//                               <div
//                                 key={wi}
//                                 className="flex items-center gap-2 text-xs mb-1"
//                               >
//                                 <span className="text-[10px] text-muted-foreground font-bold w-4">
//                                   {wi + 1}.
//                                 </span>
//                                 <div
//                                   className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0"
//                                   style={{ background: "hsl(38 92% 44%)" }}
//                                 >
//                                   {w.name?.[0] ?? "?"}
//                                 </div>
//                                 <span className="font-medium">{w.name}</span>
//                               </div>
//                             ))}
//                         </div>
//                       )}
//                     </motion.div>
//                   )}
//                 </AnimatePresence>
//               </motion.div>
//             );
//           })}
//         </div>
//       )}

//       {/* Upcoming bookings */}
//       {upcomingBookings.length > 0 && (
//         <div className="mk2-card mt-7">
//           <div className="font-bold text-sm mb-3">
//             Your Upcoming Bookings ({upcomingBookings.length})
//           </div>
//           {upcomingBookings.map((b: any, i: number) => {
//             const bColor = CATEGORY_COLORS[b.category] ?? "hsl(20 100% 50%)";
//             return (
//               <div
//                 key={i}
//                 className="flex justify-between items-center px-3 py-2 rounded-lg mb-1.5 text-xs flex-wrap gap-1.5"
//                 style={{
//                   background: `${bColor}10`,
//                   border: `1px solid ${bColor}30`,
//                 }}
//               >
//                 <span className="font-bold" style={{ color: bColor }}>
//                   {b.name}
//                 </span>
//                 <span className="text-muted-foreground">
//                   {b.displayDate || b.dateKey}
//                 </span>
//                 <span className="text-muted-foreground">
//                   {b.time} · {b.trainer}
//                 </span>
//               </div>
//             );
//           })}
//         </div>
//       )}
//     </div>
//   );
// }
