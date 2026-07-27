import { useState, useEffect, useRef } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  fetchCollection,
  addToCollection,
  updateInCollection,
  deleteFromCollection,
} from "@/lib/firebase";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { ref, get, set, remove, push, onValue } from "firebase/database";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { CouponsManager } from "@/components/Couponsmanager";
import { QRScanner } from "@/components/shared/QRScanner";
import { DeletionRequestManager } from "@/components/DeletionRequests";
import {
  buildBookingKey,
  formatDateKey,
  getDayName,
} from "@/pages/ClassBooking";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const INTENSITIES = [
  "Low",
  "Low–Medium",
  "Medium",
  "Medium–High",
  "High",
  "Very High",
];
const NEWS_TYPES = ["News", "Event", "Announcement"];

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
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const inp: any = {
  width: "100%",
  background: "hsl(var(--secondary))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  padding: "10px 14px",
  color: "hsl(var(--foreground))",
  fontSize: 13,
  outline: "none",
  fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};
const lbl: any = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "hsl(var(--muted-foreground))",
  display: "block",
  marginBottom: 6,
};

function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  full = false,
}: any) {
  const s: any = {
    primary: { background: "hsl(20 100% 50%)", color: "#000", border: "none" },
    ghost: {
      background: "transparent",
      color: "hsl(20 100% 50%)",
      border: "1px solid hsl(20 100% 50%)",
    },
    danger: { background: "hsl(0 84% 51%)", color: "#fff", border: "none" },
    subtle: {
      background: "hsl(var(--secondary))",
      color: "hsl(var(--foreground))",
      border: "1px solid hsl(var(--border))",
    },
    green: { background: "hsl(142 72% 37%)", color: "#fff", border: "none" },
    blue: { background: "hsl(217 91% 53%)", color: "#fff", border: "none" },
  }[variant];
  const pad: any = { sm: "6px 14px", md: "9px 20px", lg: "12px 28px" }[size];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...s,
        padding: pad,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "var(--font-body)",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: full ? "100%" : "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}

function MToast({ msg, type, onDone }: any) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg: any =
    {
      success: "hsl(142 72% 37%)",
      error: "hsl(0 84% 51%)",
      info: "hsl(20 100% 50%)",
    }[type] || "hsl(20 100% 50%)";
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: bg,
        color: type === "error" ? "#fff" : "#000",
        borderRadius: 10,
        padding: "12px 20px",
        fontWeight: 700,
        fontSize: 13,
        fontFamily: "var(--font-body)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
      }}
    >
      {msg}
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const check = () =>
    pw === ADMIN_PASSWORD
      ? onLogin()
      : (setErr("Incorrect password"), setPw(""));
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "hsl(var(--background))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 16,
          padding: "36px 32px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            letterSpacing: "0.15em",
            color: "hsl(20 100% 50%)",
            marginBottom: 4,
          }}
        >
          MK2R ADMIN
        </div>
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 24,
          }}
        >
          Management Portal — Authorised Access Only
        </div>
        <label style={lbl}>Admin Password</label>
        <input
          type="password"
          style={{ ...inp, marginBottom: 8 }}
          placeholder="Enter password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && check()}
        />
        {err && (
          <div
            style={{ fontSize: 12, color: "hsl(0 84% 51%)", marginBottom: 10 }}
          >
            {err}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <Btn variant="primary" size="lg" onClick={check} full>
            Enter Admin Panel →
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── FIX 1: Admin component with session-persistent auth ───────────────────────
// Replace your existing Admin() function shell with this pattern.
// Auth survives tab switches / navigation but clears when the browser is closed.
//
// function Admin() {
//   const [authed, setAuthed] = useState(
//     () => sessionStorage.getItem("mk2r_admin_authed") === "true"
//   );
//
//   const handleLogin = () => {
//     sessionStorage.setItem("mk2r_admin_authed", "true");
//     setAuthed(true);
//   };
//
//   const handleLogout = () => {
//     sessionStorage.removeItem("mk2r_admin_authed");
//     setAuthed(false);
//   };
//
//   if (!authed) return <AdminLogin onLogin={handleLogin} />;
//
//   // Pass handleLogout down to your admin header/nav, e.g.:
//   // return <AdminShell onLogout={handleLogout} />;
//   // Then in that header:
//   // <Btn variant="danger" size="sm" onClick={onLogout}>🔒 Lock Admin</Btn>
// }

// ── Admin Calendar (timezone‑safe) ───────────────────────────────────────────
function AdminCalendar({
  selectedDate,
  onSelect,
  classDateCounts,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  classDateCounts: Record<string, number>;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());
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
    <div
      style={{
        background: "hsl(var(--secondary))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "hsl(var(--muted-foreground))",
            fontSize: 16,
            padding: "2px 8px",
          }}
        >
          ←
        </button>
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </div>
        <button
          onClick={nextMonth}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "hsl(var(--muted-foreground))",
            fontSize: 16,
            padding: "2px 8px",
          }}
        >
          →
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          marginBottom: 4,
        }}
      >
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 10,
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              padding: "2px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          gap: 2,
        }}
      >
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const date = new Date(viewYear, viewMonth, day);
          date.setHours(0, 0, 0, 0);
          const key = formatDateKey(date);
          const isToday = date.getTime() === today.getTime();
          const isSel = formatDateKey(selectedDate) === key;
          const count = classDateCounts[key] || 0;
          return (
            <button
              key={i}
              onClick={() => onSelect(new Date(viewYear, viewMonth, day))}
              style={{
                aspectRatio: "1",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background: isSel
                  ? "hsl(20 100% 50%)"
                  : isToday
                    ? "hsl(20 100% 50% / 0.15)"
                    : "transparent",
                color: isSel
                  ? "#000"
                  : isToday
                    ? "hsl(20 100% 50%)"
                    : "hsl(var(--foreground))",
                outline:
                  isToday && !isSel ? "1px solid hsl(20 100% 50%)" : "none",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
              }}
            >
              {day}
              {count > 0 && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: isSel ? "#000" : "hsl(20 100% 50%)",
                    display: "block",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Category Manager ──────────────────────────────────────────────────────────
function CategoryManager({ toast }: any) {
  const [cats, setCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get(ref(db, "class_categories")).then((snap) => {
      if (snap.exists()) setCats(snap.val());
      else
        setCats([
          "Crossfit",
          "Gymnastics",
          "Strength",
          "Olympic Lifting",
          "Saturday Smasher",
        ]);
    });
  }, []);

  const save = async (updated: string[]) => {
    setSaving(true);
    try {
      await set(ref(db, "class_categories"), updated);
      setCats(updated);
      toast("Categories saved ✓", "success");
    } catch {
      toast("Save failed", "error");
    }
    setSaving(false);
  };

  const add = () => {
    const trimmed = newCat.trim();
    if (!trimmed || cats.includes(trimmed)) return;
    save([...cats, trimmed]);
    setNewCat("");
  };

  const removeCat = (cat: string) => {
    if (!confirm(`Delete "${cat}"?`)) return;
    save(cats.filter((c) => c !== cat));
  };

  return (
    <div
      style={{
        background: "hsl(var(--secondary))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 20,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
        📂 Class Categories
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}
      >
        {cats.map((cat) => (
          <div
            key={cat}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 20,
              background: "hsl(20 100% 50% / 0.1)",
              border: "1px solid hsl(20 100% 50% / 0.3)",
              fontSize: 12,
              fontWeight: 700,
              color: "hsl(20 100% 50%)",
            }}
          >
            {cat}
            <button
              onClick={() => removeCat(cat)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(0 84% 51%)",
                fontSize: 12,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...inp, flex: 1 }}
          placeholder="New category name…"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Btn
          variant="primary"
          size="sm"
          onClick={add}
          disabled={saving || !newCat.trim()}
        >
          + Add
        </Btn>
      </div>
    </div>
  );
}

function PendingPanel({
  cls,
  selectedDateKey,
}: {
  cls: any;
  selectedDateKey: string;
}) {
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Read mk2_bookings filtered by classId + dateKey + status
    get(ref(db, "mk2_bookings")).then((snap) => {
      if (!snap.exists()) {
        setLoaded(true);
        return;
      }
      const list: any[] = [];
      Object.entries(snap.val()).forEach(([key, v]: [string, any]) => {
        if (
          v.status === "pending_payment" &&
          v.classId === cls.id &&
          v.dateKey === selectedDateKey
        ) {
          list.push({ key, ...v });
        }
      });
      list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      setPendingItems(list);
      setLoaded(true);
    });
  }, [cls.id, selectedDateKey]);

  if (!loaded || pendingItems.length === 0) return null;

  const STUCK_THRESHOLD = 15 * 60 * 1000;

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid hsl(var(--border))",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "hsl(38 92% 44%)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 8,
        }}
      >
        ⏳ Pending Payment ({pendingItems.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pendingItems.map((item) => {
          const ageMs = Date.now() - (item.createdAt ?? 0);
          const isStuck = ageMs > STUCK_THRESHOLD;
          const minsLeft = Math.max(0, 15 - Math.floor(ageMs / 60000));
          return (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 8,
                background: isStuck
                  ? "hsl(0 84% 51% / 0.06)"
                  : "hsl(38 92% 44% / 0.06)",
                border: `1px solid ${isStuck ? "hsl(0 84% 51% / 0.25)" : "hsl(38 92% 44% / 0.25)"}`,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: isStuck ? "hsl(0 84% 51%)" : "hsl(38 92% 44%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#000",
                    flexShrink: 0,
                  }}
                >
                  {(item.userName ?? "?")?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {item.userName ?? item.userId}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    R{item.price} ·{" "}
                    {isStuck
                      ? "⚠ Stuck — auto-release overdue"
                      : `⏳ ${minsLeft} min until auto-release`}
                  </div>
                </div>
              </div>
              <div
                style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
              >
                {timeAgo(item.createdAt ?? 0)}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        To manually release a stuck spot, go to the{" "}
        <strong style={{ color: "hsl(20 100% 50%)" }}>Pending Payments</strong>{" "}
        tab.
      </div>
    </div>
  );
}

// ── FIX 2: WodViewer — shows warmup, exercises and WOD notes in the expanded panel ──
function WodViewer({ cls }: { cls: any }) {
  const hasWarmup = String(cls.warmup ?? "").trim().length > 0;
  const hasExercises = Array.isArray(cls.exercises) && cls.exercises.length > 0;
  const hasWodNotes = String(cls.wod ?? "").trim().length > 0;

  if (!hasWarmup && !hasExercises && !hasWodNotes) return null;

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid hsl(var(--border))",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "hsl(20 100% 50%)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 10,
        }}
      >
        📋 Today's Workout
      </div>

      {/* Warm up */}
      {hasWarmup && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              marginBottom: 4,
            }}
          >
            🔥 WARM UP
          </div>
          <pre
            style={{
              fontSize: 12,
              color: "hsl(var(--foreground))",
              background: "hsl(var(--secondary))",
              borderRadius: 8,
              padding: "10px 12px",
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              lineHeight: 1.6,
            }}
          >
            {cls.warmup}
          </pre>
        </div>
      )}

      {/* Workout — free-format blocks (falls back to a readable line for
          any older classes that still have the old structured format) */}
      {hasExercises && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              marginBottom: 6,
            }}
          >
            ⚡ WORKOUT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cls.exercises.map((block: any, i: number) => (
              <pre
                key={i}
                style={{
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
                  background: "hsl(var(--secondary))",
                  borderRadius: 8,
                  padding: "10px 12px",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  lineHeight: 1.6,
                }}
              >
                {typeof block === "string"
                  ? block
                  : [
                      block?.name,
                      block?.sets,
                      block?.value
                        ? `${block.value} ${block.measure ?? ""}`.trim()
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" — ")}
              </pre>
            ))}
          </div>
        </div>
      )}

      {/* WOD Notes */}
      {hasWodNotes && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "hsl(var(--muted-foreground))",
              marginBottom: 4,
            }}
          >
            📝 NOTES / SCALING
          </div>
          <pre
            style={{
              fontSize: 12,
              color: "hsl(var(--foreground))",
              background: "hsl(var(--secondary))",
              borderRadius: 8,
              padding: "10px 12px",
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: "monospace",
              lineHeight: 1.6,
            }}
          >
            {cls.wod}
          </pre>
        </div>
      )}
    </div>
  );
}

// Converts legacy structured exercises ({name, sets, value, measure}) into
// a single readable line, so switching to free-text workouts doesn't lose
// data already saved on older classes. New workouts are plain strings and
// pass through untouched.
const normalizeWorkoutBlocks = (arr: any[]): string[] =>
  (arr || []).map((item) =>
    typeof item === "string"
      ? item
      : [
          item?.name,
          item?.sets,
          item?.value ? `${item.value} ${item.measure ?? ""}`.trim() : "",
        ]
          .filter(Boolean)
          .join(" — "),
  );

// ── Classes Manager ───────────────────────────────────────────────────────────
function ClassesManager({ toast }: any) {
  const [cats, setCats] = useState<string[]>([
    "Crossfit",
    "Gymnastics",
    "Strength",
    "Olympic Lifting",
    "Saturday Smasher",
  ]);

  useEffect(() => {
    get(ref(db, "class_categories")).then((snap) => {
      if (snap.exists()) setCats(snap.val());
    });
  }, []);

  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"day" | "date">("day");
  const [calDate, setCalDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const [allBookings, setAllBookings] = useState<
    Record<string, Record<string, any>>
  >({});

  const [allWaitlists, setAllWaitlists] = useState<
    Record<string, Record<string, any>>
  >({});

  const [expandedBookings, setExpandedBookings] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const blank = {
    name: cats[0] ?? "Crossfit",
    time: "06:00",
    trainer: "",
    day: "Monday",
    specificDate: "",
    spots: "20",
    duration: "60 min",
    intensity: "Medium",
    category: cats[0] ?? "Crossfit",
    subtitle: "",
    details: "",
    scheduleType: "day",
    wod: "",
    warmup: "",
    exercises: [] as string[],
    chargeNonMembers: true,
    price: "250",
  };
  const [form, setForm] = useState(blank);

  const load = async () => {
    setLoading(true);
    setClasses(await fetchCollection("admin_classes"));
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    return onValue(ref(db, "class_bookings"), (snap) =>
      setAllBookings(snap.val() ?? {}),
    );
  }, []);

  useEffect(() => {
    return onValue(ref(db, "class_waitlist"), (snap) =>
      setAllWaitlists(snap.val() ?? {}),
    );
  }, []);

  const save = async () => {
    if (!form.name) return toast("Fill in Name, Time and Trainer", "error");

    const data = {
      ...form,
      name: form.category,
      spots: parseInt(form.spots),
      details:
        scheduleMode === "date" ? form.details.split("\n").filter(Boolean) : [],
      wod: scheduleMode === "date" ? form.wod : "",
      warmup: scheduleMode === "date" ? form.warmup : "",
      exercises: scheduleMode === "date" ? form.exercises || [] : [],
      scheduleType: scheduleMode,
      specificDate: scheduleMode === "date" ? formatDateKey(calDate) : "",
      day: scheduleMode === "day" ? form.day : getDayName(calDate),
      chargeNonMembers: Boolean(form.chargeNonMembers),
      price: form.chargeNonMembers ? parseFloat(form.price) || 0 : 0,
    };

    if (editing && !isDuplicate) {
      const existingSnap = await get(
        ref(db, `admin_classes/${editing.id}/bookedCount`),
      );
      const currentBookedCount = existingSnap.exists()
        ? (existingSnap.val() as number)
        : 0;
      await updateInCollection("admin_classes", editing.id, {
        ...data,
        bookedCount: currentBookedCount,
      });
      toast("Updated ✓", "success");
    } else {
      await addToCollection("admin_classes", { ...data, bookedCount: 0 });
      toast(isDuplicate ? "Class duplicated ✓" : "Class added ✓", "success");
    }
    setShowForm(false);
    setEditing(null);
    setIsDuplicate(false);
    setForm(blank);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this class?")) return;
    await deleteFromCollection("admin_classes", id);
    toast("Deleted", "info");
    load();
  };

  const startEdit = (c: any) => {
    setEditing(c);
    setIsDuplicate(false);
    setScheduleMode(c.scheduleType || "day");
    setForm({
      name: c.category,
      time: c.time,
      trainer: c.trainer,
      day: c.day,
      specificDate: c.specificDate || "",
      spots: String(c.spots),
      duration: c.duration,
      intensity: c.intensity,
      category: c.category,
      subtitle: c.subtitle || "",
      details: (c.details || []).join("\n"),
      scheduleType: c.scheduleType || "day",
      wod: c.wod || "",
      warmup: c.warmup || "",
      exercises: normalizeWorkoutBlocks(c.exercises || []),
      chargeNonMembers: Boolean(c.chargeNonMembers),
      price: String(c.price ?? 0),
    });
    if (c.specificDate) setCalDate(new Date(c.specificDate + "T00:00:00"));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const duplicateClass = (c: any) => {
    setEditing(c);
    setIsDuplicate(true);
    setScheduleMode(c.scheduleType || "day");
    setForm({
      name: c.name + " (copy)",
      time: c.time,
      trainer: c.trainer,
      day: c.day,
      specificDate: c.specificDate || "",
      spots: String(c.spots),
      duration: c.duration,
      intensity: c.intensity,
      category: c.category,
      subtitle: c.subtitle || "",
      details: (c.details || []).join("\n"),
      scheduleType: c.scheduleType || "day",
      wod: c.wod || "",
      warmup: c.warmup || "",
      exercises: normalizeWorkoutBlocks(c.exercises || []),
      chargeNonMembers: Boolean(c.chargeNonMembers),
      price: String(c.price ?? 0),
    });
    if (c.specificDate) setCalDate(new Date(c.specificDate + "T00:00:00"));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const classDateCounts: Record<string, number> = {};
  classes.forEach((cls) => {
    if (cls.scheduleType === "date" && cls.specificDate) {
      classDateCounts[cls.specificDate] =
        (classDateCounts[cls.specificDate] || 0) + 1;
    } else {
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dayName = getDayName(d);
        if (cls.day === dayName) {
          const key = formatDateKey(d);
          classDateCounts[key] = (classDateCounts[key] || 0) + 1;
        }
      }
    }
  });

  const selectedDateKey = formatDateKey(calDate);
  const selectedDayName = getDayName(calDate);

  const classesOnDate = classes
    .filter((cls) =>
      cls.scheduleType === "date"
        ? cls.specificDate === selectedDateKey
        : cls.day === selectedDayName,
    )
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const adminCancelBooking = async (
    cls: any,
    uid: string,
    memberName: string,
  ) => {
    if (!confirm(`Remove ${memberName}'s booking from ${cls.name}?`)) return;
    setCancelling(`${cls.name}_${uid}`);
    const bk = buildBookingKey(cls.name, selectedDateKey);
    try {
      await set(ref(db, `class_bookings/${bk}/${uid}`), null);
      const credSnap = await get(ref(db, `mk2_users/${uid}/classCredits`));
      const current = credSnap.exists() ? (credSnap.val() as number) : 0;
      await set(ref(db, `mk2_users/${uid}/classCredits`), current + 1);
      await push(ref(db, `mk2_users/${uid}/creditHistory`), {
        amount: +1,
        type: "admin_cancel",
        note: `Admin removed: ${cls.name} on ${selectedDateKey}`,
        timestamp: Date.now(),
      });
      const userSnap = await get(ref(db, `mk2_users/${uid}/bookings`));
      if (userSnap.exists()) {
        const bookings = userSnap.val();
        const filtered = Array.isArray(bookings)
          ? bookings.filter(
              (b: any) =>
                !(b.name === cls.name && b.dateKey === selectedDateKey),
            )
          : [];
        await set(ref(db, `mk2_users/${uid}/bookings`), filtered);
      }
      toast(`${memberName} removed · credit refunded ✓`, "success");
    } catch {
      toast("Cancel failed", "error");
    }
    setCancelling(null);
  };

  const cancelEntireClass = async (cls: any) => {
    const currentBookings = getClassBookings(cls);
    const count = currentBookings.length;
    if (
      !confirm(
        `Cancel ${cls.name} on ${selectedDateKey}? This will remove all ${count} booking(s) and notify members.`,
      )
    )
      return;

    const bk = buildBookingKey(cls.name, selectedDateKey);

    const bookingsSnap = await get(ref(db, `class_bookings/${bk}`));
    const booked = bookingsSnap.exists()
      ? Object.entries(bookingsSnap.val())
      : [];

    for (const [uid] of booked) {
      await push(ref(db, `users/${uid}/notifications`), {
        title: "Class Cancelled",
        body: `${cls.name} on ${selectedDateKey} at ${cls.time} has been cancelled by the gym. Sorry for the inconvenience.`,
        type: "class_cancelled",
        read: false,
        createdAt: Date.now(),
      });
      const userSnap = await get(ref(db, `mk2_users/${uid}/bookings`));
      if (userSnap.exists()) {
        const userBookings = Array.isArray(userSnap.val())
          ? userSnap.val()
          : [];
        await set(
          ref(db, `mk2_users/${uid}/bookings`),
          userBookings.filter(
            (b: any) => !(b.name === cls.name && b.dateKey === selectedDateKey),
          ),
        );
      }
    }

    await remove(ref(db, `class_bookings/${bk}`));
    await remove(ref(db, `class_waitlist/${bk}`));

    if (cls.scheduleType === "date") {
      await deleteFromCollection("admin_classes", cls.id);
      load();
    }

    toast(
      `${cls.name} cancelled · ${booked.length} member(s) notified`,
      "success",
    );
  };

  const getClassBookings = (
    cls: any,
  ): Array<{ uid: string; name: string; email: string }> => {
    const bk = buildBookingKey(cls.name, selectedDateKey);
    const raw = allBookings[bk] ?? {};
    return Object.entries(raw).map(([uid, val]: [string, any]) => ({
      uid,
      name: val.name || "Unknown",
      email: val.email || "",
    }));
  };

  const getClassWaitlist = (
    cls: any,
  ): Array<{ uid: string; name: string; joinedAt: number }> => {
    const bk = buildBookingKey(cls.name, selectedDateKey);
    const raw = allWaitlists[bk] ?? {};
    return Object.entries(raw)
      .map(([uid, val]: [string, any]) => ({
        uid,
        name: val.name || "Unknown",
        joinedAt: val.joinedAt ?? 0,
      }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  };

  const ClassActions = ({
    cls,
    bookings,
    waitlist,
  }: {
    cls: any;
    bookings?: any[];
    waitlist?: any[];
  }) => (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {bookings !== undefined && (
        <button
          onClick={() =>
            setExpandedBookings(expandedBookings === cls.id ? null : cls.id)
          }
          style={{
            padding: "5px 12px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            background:
              bookings.length > 0
                ? "hsl(20 100% 50% / 0.15)"
                : "hsl(var(--secondary))",
            color:
              bookings.length > 0
                ? "hsl(20 100% 50%)"
                : "hsl(var(--muted-foreground))",
            border: `1px solid ${bookings.length > 0 ? "hsl(20 100% 50% / 0.3)" : "hsl(var(--border))"}`,
          }}
        >
          👥 {bookings.length}/{cls.spots}
          {waitlist && waitlist.length > 0
            ? ` · ⏳${waitlist.length}`
            : ""}{" "}
          {expandedBookings === cls.id ? "▲" : "▼"}
        </button>
      )}
      <Btn variant="subtle" size="sm" onClick={() => startEdit(cls)}>
        ✏️ Edit
      </Btn>
      <Btn variant="blue" size="sm" onClick={() => duplicateClass(cls)}>
        ⧉ Duplicate
      </Btn>
      <Btn variant="danger" size="sm" onClick={() => cancelEntireClass(cls)}>
        🚫 Cancel Class
      </Btn>
      <Btn variant="danger" size="sm" onClick={() => del(cls.id)}>
        Delete
      </Btn>
    </div>
  );

  return (
    <div>
      <CategoryManager toast={toast} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Classes ({classes.length})
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              background: "hsl(var(--secondary))",
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}
          >
            {(["calendar", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  background:
                    viewMode === v ? "hsl(20 100% 50%)" : "transparent",
                  color:
                    viewMode === v ? "#000" : "hsl(var(--muted-foreground))",
                  border: "none",
                  textTransform: "capitalize",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <Btn
            variant="primary"
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setEditing(null);
              setIsDuplicate(false);
              setForm(blank);
              setScheduleMode("day");
            }}
          >
            {showForm ? "✕ Cancel" : "+ Add Class"}
          </Btn>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              {isDuplicate
                ? "Duplicate Class"
                : editing
                  ? "Edit Class"
                  : "New Class"}
            </div>
            {isDuplicate && (
              <div
                style={{
                  fontSize: 11,
                  color: "hsl(217 91% 53%)",
                  marginBottom: 14,
                  padding: "6px 10px",
                  background: "hsl(217 91% 53% / 0.1)",
                  borderRadius: 6,
                  border: "1px solid hsl(217 91% 53% / 0.3)",
                }}
              >
                ⧉ Duplicating from "{editing?.name}" — adjust details and save
                as a new class.
              </div>
            )}
            <div style={{ marginBottom: 14 }} />

            {/* Schedule Type */}
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Schedule Type</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["day", "date"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScheduleMode(mode)}
                    style={{
                      padding: "7px 18px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor:
                        scheduleMode === mode
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--border))",
                      background:
                        scheduleMode === mode
                          ? "hsl(20 100% 50%)"
                          : "transparent",
                      color:
                        scheduleMode === mode
                          ? "#000"
                          : "hsl(var(--foreground))",
                    }}
                  >
                    {mode === "day"
                      ? "📅 Weekly (recurring)"
                      : "🗓 Workout Details (once-off)"}
                  </button>
                ))}
              </div>
              {scheduleMode === "day" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    padding: "6px 10px",
                    background: "hsl(142 72% 37% / 0.08)",
                    borderRadius: 6,
                    border: "1px solid hsl(142 72% 37% / 0.2)",
                  }}
                >
                  ℹ️ WOD details are added per-date on once-off classes. Weekly
                  recurring classes share the same template.
                </div>
              )}
            </div>

            {/* Day / Date picker */}
            {scheduleMode === "day" ? (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Day of Week</label>
                <select style={inp} value={form.day} onChange={f("day")}>
                  {DAYS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Pick a Date</label>
                <AdminCalendar
                  selectedDate={calDate}
                  onSelect={setCalDate}
                  classDateCounts={classDateCounts}
                />
                <div
                  style={{
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: -10,
                    marginBottom: 8,
                  }}
                >
                  Selected:{" "}
                  <strong style={{ color: "hsl(20 100% 50%)" }}>
                    {calDate.toLocaleDateString("en-ZA", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                </div>
              </div>
            )}

            {/* Core fields grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              {(
                [
                  ["trainer", "Trainer", "Coach Marcus"],
                  ["duration", "Duration", "60 min"],
                  ["subtitle", "Subtitle", "Short description"],
                ] as any[]
              ).map(([k, l, p]: any) => (
                <div key={k}>
                  <label style={lbl}>{l}</label>
                  <input
                    style={inp}
                    placeholder={p}
                    value={(form as any)[k]}
                    onChange={f(k)}
                  />
                </div>
              ))}

              {/* Max Spots dropdown */}
              <div>
                <label style={lbl}>Max Spots</label>
                <select
                  style={inp}
                  value={form.spots}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, spots: e.target.value }))
                  }
                >
                  {[
                    "5",
                    "8",
                    "10",
                    "12",
                    "15",
                    "16",
                    "18",
                    "20",
                    "24",
                    "25",
                    "30",
                    "40",
                    "50",
                  ].map((n) => (
                    <option key={n} value={n}>
                      {n} spots
                    </option>
                  ))}
                </select>
              </div>

              {/* Time dropdown */}
              <div>
                <label style={lbl}>Time</label>
                <select style={inp} value={form.time} onChange={f("time")}>
                  {[
                    "05:00",
                    "05:15",
                    "05:30",
                    "05:45",
                    "06:00",
                    "06:15",
                    "06:30",
                    "06:45",
                    "07:00",
                    "07:15",
                    "07:30",
                    "07:45",
                    "08:00",
                    "08:15",
                    "08:30",
                    "08:45",
                    "09:00",
                    "09:15",
                    "09:30",
                    "09:45",
                    "10:00",
                    "10:15",
                    "10:30",
                    "10:45",
                    "11:00",
                    "11:30",
                    "12:00",
                    "12:30",
                    "13:00",
                    "13:30",
                    "14:00",
                    "14:30",
                    "15:00",
                    "15:30",
                    "16:00",
                    "16:30",
                    "17:00",
                    "17:15",
                    "17:30",
                    "17:45",
                    "18:00",
                    "18:15",
                    "18:30",
                    "18:45",
                    "19:00",
                    "19:15",
                    "19:30",
                    "19:45",
                    "20:00",
                    "20:30",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category dropdown */}
              <div>
                <label style={lbl}>Category</label>
                <select
                  style={inp}
                  value={form.category}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      category: e.target.value,
                      name: e.target.value,
                    }))
                  }
                >
                  {cats.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Non-Member Booking */}
            <div
              style={{
                marginBottom: 14,
                padding: "14px 16px",
                background: "hsl(var(--background))",
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
                Non-Member Booking
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <input
                  type="checkbox"
                  id="chargeNonMembers"
                  checked={Boolean(form.chargeNonMembers)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      chargeNonMembers: e.target.checked,
                      price: e.target.checked ? p.price : "0",
                    }))
                  }
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <label
                  htmlFor="chargeNonMembers"
                  style={{
                    fontSize: 13,
                    color: "hsl(var(--foreground))",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  Charge non-members to book this class
                </label>
              </div>
              {form.chargeNonMembers ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, maxWidth: 200 }}>
                    <label style={lbl}>Price (ZAR)</label>
                    <input
                      type="number"
                      style={inp}
                      placeholder="250.00"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={f("price")}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 20,
                    }}
                  >
                    Non-members will pay via PayFast before booking is
                    confirmed.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Non-members can book this class for free (no payment
                  required).
                </div>
              )}
            </div>

            {/* Warm Up + Workout — once-off classes only */}
            {scheduleMode === "date" && (
              <>
                {/* Warm Up */}
                <div
                  style={{
                    marginBottom: 14,
                    padding: "14px 16px",
                    background: "hsl(var(--background))",
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  <div
                    style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}
                  >
                    🔥 Warm Up
                  </div>
                  <textarea
                    style={{
                      ...inp,
                      minHeight: 80,
                      resize: "vertical",
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                    placeholder={
                      "e.g. 3 ROUNDS\n0:30 Row\n10 Air Squats\n10 Push-ups"
                    }
                    value={form.warmup}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, warmup: e.target.value }))
                    }
                  />
                </div>

                {/* Workout */}
                {/* Workout — free-format text, one or more blocks */}
                <div
                  style={{
                    marginBottom: 14,
                    padding: "14px 16px",
                    background: "hsl(var(--background))",
                    borderRadius: 10,
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  <div
                    style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}
                  >
                    ⚡ Workout
                  </div>

                  {(form.exercises || []).map((block: string, i: number) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <label style={lbl}>
                          {(form.exercises || []).length > 1
                            ? `Workout ${i + 1}`
                            : "Workout"}
                        </label>
                        {(form.exercises || []).length > 1 && (
                          <button
                            onClick={() => {
                              const updated = (form.exercises || []).filter(
                                (_: any, j: number) => j !== i,
                              );
                              setForm((p) => ({ ...p, exercises: updated }));
                            }}
                            style={{
                              background: "hsl(0 84% 51% / 0.1)",
                              border: "1px solid hsl(0 84% 51% / 0.3)",
                              color: "hsl(0 84% 51%)",
                              borderRadius: 6,
                              padding: "2px 10px",
                              cursor: "pointer",
                              fontSize: 11,
                              fontWeight: 700,
                              fontFamily: "var(--font-body)",
                            }}
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>
                      <textarea
                        style={{
                          ...inp,
                          minHeight: 80,
                          resize: "vertical",
                          fontFamily: "monospace",
                          fontSize: 12,
                        }}
                        placeholder={
                          "e.g. 5 ROUNDS FOR TIME\n10 Deadlifts @ 60kg\n15 Box Jumps\n20 Cal Row"
                        }
                        value={block}
                        onChange={(e) => {
                          const updated = [...(form.exercises || [])];
                          updated[i] = e.target.value;
                          setForm((p) => ({ ...p, exercises: updated }));
                        }}
                      />
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        exercises: [...(p.exercises || []), ""],
                      }))
                    }
                    style={{
                      marginTop: 4,
                      padding: "8px 16px",
                      borderRadius: 8,
                      border: "1px dashed hsl(20 100% 50% / 0.4)",
                      background: "hsl(20 100% 50% / 0.06)",
                      color: "hsl(20 100% 50%)",
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    + Add Workout
                  </button>

                  <div style={{ marginTop: 14 }}>
                    <label style={lbl}>Additional WOD Notes</label>
                    <textarea
                      style={{
                        ...inp,
                        minHeight: 80,
                        resize: "vertical",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                      placeholder={
                        "e.g. Comp: 80/55kg\nScaled: 60/40kg\nBeg: 40/30kg"
                      }
                      value={form.wod}
                      onChange={f("wod")}
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn variant="primary" onClick={save}>
                {isDuplicate
                  ? "Save as New Class"
                  : editing
                    ? "Save Changes"
                    : "Add Class"}
              </Btn>
              <Btn
                variant="subtle"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setIsDuplicate(false);
                }}
              >
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <>
          <AdminCalendar
            selectedDate={calDate}
            onSelect={(d) => {
              setCalDate(d);
              setExpandedBookings(null);
            }}
            classDateCounts={classDateCounts}
          />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              {calDate.toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}{" "}
              — {classesOnDate.length} class
              {classesOnDate.length !== 1 ? "es" : ""}
            </div>
            {loading ? (
              <div
                style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}
              >
                Loading…
              </div>
            ) : classesOnDate.length === 0 ? (
              <div
                style={{
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 13,
                  padding: "16px 0",
                }}
              >
                No classes on this date.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {classesOnDate.map((cls) => {
                  const bookings = getClassBookings(cls);
                  const waitlist = getClassWaitlist(cls);
                  const isExpanded = expandedBookings === cls.id;
                  return (
                    <div
                      key={cls.id}
                      style={{
                        background: "hsl(var(--secondary))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            {cls.name}
                            <span
                              style={{
                                fontSize: 10,
                                padding: "2px 8px",
                                borderRadius: 20,
                                background:
                                  cls.scheduleType === "date"
                                    ? "hsl(217 91% 53% / 0.15)"
                                    : "hsl(142 72% 37% / 0.15)",
                                color:
                                  cls.scheduleType === "date"
                                    ? "hsl(217 91% 53%)"
                                    : "hsl(142 72% 37%)",
                                fontWeight: 700,
                              }}
                            >
                              {cls.scheduleType === "date"
                                ? "Once-off"
                                : "Weekly"}
                            </span>
                            {cls.chargeNonMembers && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: "2px 8px",
                                  borderRadius: 20,
                                  background: "hsl(38 92% 44% / 0.15)",
                                  color: "hsl(38 92% 44%)",
                                  fontWeight: 700,
                                  border: "1px solid hsl(38 92% 44% / 0.3)",
                                }}
                              >
                                💳 R{Number(cls.price).toFixed(0)} non-members
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "hsl(var(--muted-foreground))",
                              marginTop: 2,
                            }}
                          >
                            {cls.time} · {cls.trainer} · {cls.spots} spots ·{" "}
                            {cls.category}
                          </div>
                        </div>
                        <ClassActions
                          cls={cls}
                          bookings={bookings}
                          waitlist={waitlist}
                        />
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            style={{
                              borderTop: "1px solid hsl(var(--border))",
                              background: "hsl(var(--background))",
                              padding: "12px 16px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "hsl(var(--muted-foreground))",
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                                marginBottom: 10,
                              }}
                            >
                              Booked Members ({bookings.length})
                            </div>
                            {bookings.length === 0 ? (
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "hsl(var(--muted-foreground))",
                                }}
                              >
                                No bookings yet for this class on this date.
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}
                              >
                                {bookings.map((b) => (
                                  <div
                                    key={b.uid}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: "8px 12px",
                                      borderRadius: 8,
                                      background: "hsl(var(--secondary))",
                                      flexWrap: "wrap",
                                      gap: 8,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: "50%",
                                          background: "hsl(20 100% 50%)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 700,
                                          fontSize: 13,
                                          color: "#000",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {b.name[0] ?? "?"}
                                      </div>
                                      <div>
                                        <div
                                          style={{
                                            fontWeight: 700,
                                            fontSize: 13,
                                          }}
                                        >
                                          {b.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color:
                                              "hsl(var(--muted-foreground))",
                                          }}
                                        >
                                          {b.email}
                                        </div>
                                      </div>
                                    </div>
                                    <Btn
                                      variant="danger"
                                      size="sm"
                                      disabled={
                                        cancelling === `${cls.name}_${b.uid}`
                                      }
                                      onClick={() =>
                                        adminCancelBooking(cls, b.uid, b.name)
                                      }
                                    >
                                      {cancelling === `${cls.name}_${b.uid}`
                                        ? "Removing…"
                                        : "✕ Remove"}
                                    </Btn>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Waitlist section */}
                            {(() => {
                              const wl = getClassWaitlist(cls);
                              return wl.length > 0 ? (
                                <div
                                  style={{
                                    marginTop: 12,
                                    paddingTop: 12,
                                    borderTop: "1px solid hsl(var(--border))",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      color: "hsl(38 92% 44%)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.1em",
                                      marginBottom: 8,
                                    }}
                                  >
                                    Waitlist ({wl.length})
                                  </div>
                                  {wl.map((w, wi) => (
                                    <div
                                      key={w.uid}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "6px 10px",
                                        borderRadius: 8,
                                        background: "hsl(var(--secondary))",
                                        marginBottom: 4,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: 11,
                                          color: "hsl(var(--muted-foreground))",
                                          fontWeight: 700,
                                          width: 16,
                                        }}
                                      >
                                        {wi + 1}.
                                      </span>
                                      <div
                                        style={{
                                          width: 26,
                                          height: 26,
                                          borderRadius: "50%",
                                          background: "hsl(38 92% 44%)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontWeight: 700,
                                          fontSize: 12,
                                          color: "#000",
                                          flexShrink: 0,
                                        }}
                                      >
                                        {w.name[0]}
                                      </div>
                                      <span
                                        style={{
                                          fontWeight: 700,
                                          fontSize: 13,
                                        }}
                                      >
                                        {w.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()}

                            {/* FIX 2: Workout viewer — shows warmup / exercises / WOD notes */}
                            <PendingPanel
                              cls={cls}
                              selectedDateKey={selectedDateKey}
                            />
                            <WodViewer cls={cls} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* List View */}
      {viewMode === "list" &&
        (loading ? (
          <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
            Loading…
          </div>
        ) : classes.length === 0 ? (
          <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
            No classes yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {classes.map((cls) => (
              <div
                key={cls.id}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {cls.name}
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background:
                          cls.scheduleType === "date"
                            ? "hsl(217 91% 53% / 0.15)"
                            : "hsl(142 72% 37% / 0.15)",
                        color:
                          cls.scheduleType === "date"
                            ? "hsl(217 91% 53%)"
                            : "hsl(142 72% 37%)",
                        fontWeight: 700,
                      }}
                    >
                      {cls.scheduleType === "date" ? "Once-off" : "Weekly"}
                    </span>
                    {cls.chargeNonMembers && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "hsl(38 92% 44% / 0.15)",
                          color: "hsl(38 92% 44%)",
                          fontWeight: 700,
                          border: "1px solid hsl(38 92% 44% / 0.3)",
                        }}
                      >
                        💳 R{Number(cls.price).toFixed(0)}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {cls.scheduleType === "date"
                      ? new Date(
                          cls.specificDate + "T00:00:00",
                        ).toLocaleDateString("en-ZA", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : cls.day}{" "}
                    · {cls.time} · {cls.trainer} · {cls.spots} spots
                  </div>
                </div>
                {/* List view: no bookings/waitlist props — no date context */}
                <ClassActions cls={cls} />
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOKING EXPORTS — paste this component above export function Admin()
//
// No new npm packages needed — CSV uses a Blob download, print uses
// window.print() with a hidden iframe.
//
// WIRE UP:
// 1. NAV: in NAV_GROUPS "Admin" group items add:
//      { id: "exports", icon: "ti-download", label: "Exports" },
//
// 2. ROUTE: in Admin() motion.div block add:
//      {tab === "exports" && <BookingExports toast={toast} />}
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadCSV(filename: string, rows: string[][]) {
  const escape = (v: string) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printHTML(title: string, html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { font-size: 12px; color: #555; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 11px;
             text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #ddd; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
        tr:last-child td { border-bottom: none; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px;
                 font-weight: bold; background: #f0f0f0; }
        .badge-gold   { background: #fef3c7; color: #92400e; }
        .badge-silver { background: #f1f5f9; color: #475569; }
        .badge-basic  { background: #f3f4f6; color: #6b7280; }
        .footer { margin-top: 28px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { body { padding: 16px; } }
      </style>
    </head>
    <body>
      ${html}
      <div class="footer">MK2R Admin · Exported ${new Date().toLocaleString("en-ZA")}</div>
    </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =============================================================================
// MANUAL CASH BOOKING — paste above export function Admin() in Admin.tsx
//
// Logic:
// - Members (any tier except basic): book directly, no credits touched
// - Non-members (basic): deduct 1 credit if they have one, else force-book
//   with a cash_override note on their creditHistory
// - Category rules enforced, monthly/daily limits skipped (admin override)
// - Full class → adds to waitlist instead of blocking
//
// WIRE UP:
// 1. NAV: in NAV_GROUPS "Classes" group items add:
//      { id: "cashbooking", icon: "ti-cash", label: "Cash Booking" },
//
// 2. ROUTE: in Admin() motion.div block add:
//      {tab === "cashbooking" && <ManualCashBooking toast={toast} />}
// =============================================================================

// ── Tier category rules (mirrored from booking.ts) ────────────────────────────
const CASH_TIER_ALLOWED: Record<string, string[]> = {
  u18: ["Crossfit"],
  hybrid_12m: [
    "Crossfit",
    "Gymnastics",
    "Strength",
    "Olympic Lifting",
    "Saturday Smasher",
  ],
  hybrid_6m: [
    "Crossfit",
    "Gymnastics",
    "Strength",
    "Olympic Lifting",
    "Saturday Smasher",
  ],
  hybrid_m2m: [
    "Crossfit",
    "Gymnastics",
    "Strength",
    "Olympic Lifting",
    "Saturday Smasher",
  ],
  unlimited_12m: [],
  unlimited_6m: [],
  unlimited_m2m: [],
  basic: [],
};

function isCategoryAllowed(tier: string, category: string): boolean {
  const allowed = CASH_TIER_ALLOWED[tier] ?? [];
  return allowed.length === 0 || allowed.includes(category);
}

function ManualCashBooking({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedUid, setSelectedUid] = useState("");
  const [selectedClsId, setSelectedClsId] = useState("");
  const [bookingDate, setBookingDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [payNote, setPayNote] = useState("Cash payment at reception");
  const [submitting, setSubmitting] = useState(false);

  const selectedMember = members.find((m) => m.uid === selectedUid) ?? null;
  const selectedDateKey = bookingDate.toISOString().split("T")[0];
  const selectedDayName = getDayName(bookingDate);
  const isNonMember = !selectedMember || selectedMember.membership === "basic";

  const classesOnDate = classes
    .filter((c) =>
      c.scheduleType === "date"
        ? c.specificDate === selectedDateKey
        : c.day === selectedDayName,
    )
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const selectedCls = classesOnDate.find((c) => c.id === selectedClsId) ?? null;

  const categoryBlocked =
    selectedMember &&
    selectedCls &&
    selectedMember.membership !== "basic" &&
    !isCategoryAllowed(selectedMember.membership, selectedCls.category);

  useEffect(() => {
    Promise.all([
      get(ref(db, "mk2_users")),
      get(ref(db, "admin_classes")),
    ]).then(([membersSnap, classesSnap]) => {
      if (membersSnap.exists()) {
        const list = Object.entries(membersSnap.val()).map(
          ([uid, v]: [string, any]) => ({
            uid,
            name: v.name || "Unnamed",
            email: v.email || "",
            membership: v.membership || "basic",
            classCredits: v.classCredits ?? 0,
            bookings: Array.isArray(v.bookings) ? v.bookings : [],
          }),
        );
        setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (classesSnap.exists()) {
        const list = Object.entries(classesSnap.val()).map(
          ([id, v]: [string, any]) => ({ id, ...v }),
        );
        setClasses(list);
      }
      setLoading(false);
    });
  }, []);

  const handleBook = async () => {
    if (!selectedUid) return toast("Select a member", "error");
    if (!selectedClsId) return toast("Select a class", "error");
    if (!selectedCls) return toast("Class not found", "error");
    if (categoryBlocked)
      return toast(
        `${selectedCls.category} is not included in ${selectedMember.name}'s tier`,
        "error",
      );

    setSubmitting(true);
    try {
      const bKey = buildBookingKey(selectedCls.name, selectedDateKey);
      const snap = await get(ref(db, `class_bookings/${bKey}`));
      const current: Record<string, any> = snap.val() ?? {};

      if (current[selectedUid]) {
        toast(
          `${selectedMember.name} is already booked into this class`,
          "error",
        );
        setSubmitting(false);
        return;
      }

      const isFull = Object.keys(current).length >= selectedCls.spots;

      if (isFull) {
        // ── Waitlist ──────────────────────────────────────────────────────
        const waitlistRef = ref(db, `class_waitlist/${bKey}/${selectedUid}`);
        const wSnap = await get(waitlistRef);
        if (wSnap.exists()) {
          toast(`${selectedMember.name} is already on the waitlist`, "error");
          setSubmitting(false);
          return;
        }
        await set(waitlistRef, {
          name: selectedMember.name,
          email: selectedMember.email,
          joinedAt: Date.now(),
          addedBy: "admin_cash",
          note: payNote,
        });
        await Promise.resolve(
          push(ref(db, `users/${selectedUid}/notifications`), {
            title: "Added to Waitlist",
            body: `You've been added to the waitlist for ${selectedCls.name} on ${bookingDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}. You'll be notified if a spot opens up.`,
            type: "class_update",
            read: false,
            createdAt: Date.now(),
          }),
        );
        toast(
          `Class full — ${selectedMember.name} added to waitlist ✓`,
          "info",
        );
      } else {
        // ── Confirmed booking ─────────────────────────────────────────────
        await set(ref(db, `class_bookings/${bKey}/${selectedUid}`), {
          name: selectedMember.name,
          email: selectedMember.email,
          bookedAt: Date.now(),
          status: "confirmed",
          membershipTier: selectedMember.membership,
          addedBy: "admin_cash",
          note: payNote,
        });

        await Promise.resolve(
          push(ref(db, "mk2_bookings"), {
            userId: selectedUid,
            userEmail: selectedMember.email,
            userName: selectedMember.name,
            classId: selectedCls.id,
            className: selectedCls.name,
            dateKey: selectedDateKey,
            dateDisplay: bookingDate.toLocaleDateString("en-ZA", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }),
            time: selectedCls.time,
            price: selectedCls.price ?? 0,
            status: "confirmed",
            createdAt: Date.now(),
            addedBy: "admin_cash",
            note: payNote,
          }),
        );

        // Credits for non-members
        if (isNonMember) {
          if (selectedMember.classCredits >= 1) {
            await set(
              ref(db, `mk2_users/${selectedUid}/classCredits`),
              selectedMember.classCredits - 1,
            );
            await Promise.resolve(
              push(ref(db, `mk2_users/${selectedUid}/creditHistory`), {
                amount: -1,
                type: "class_spend",
                note: `Admin cash booking: ${selectedCls.name} on ${selectedDateKey} — ${payNote}`,
                timestamp: Date.now(),
                adminAssigned: true,
              }),
            );
            setMembers((prev) =>
              prev.map((m) =>
                m.uid === selectedUid
                  ? { ...m, classCredits: m.classCredits - 1 }
                  : m,
              ),
            );
          } else {
            await Promise.resolve(
              push(ref(db, `mk2_users/${selectedUid}/creditHistory`), {
                amount: 0,
                type: "admin_assign",
                note: `Cash override — no credits deducted: ${selectedCls.name} on ${selectedDateKey} — ${payNote}`,
                timestamp: Date.now(),
                adminAssigned: true,
                cashOverride: true,
              }),
            );
          }
        }

        // Add to member booking list
        const userBookingsRef = ref(db, `mk2_users/${selectedUid}/bookings`);
        const userBookingsSnap = await get(userBookingsRef);
        const existing: any[] = userBookingsSnap.val() ?? [];
        if (
          !existing.some(
            (b: any) =>
              b.name === selectedCls.name && b.dateKey === selectedDateKey,
          )
        ) {
          await set(userBookingsRef, [
            ...existing,
            {
              name: selectedCls.name,
              dateKey: selectedDateKey,
              date: selectedCls.day ?? "",
              displayDate: bookingDate.toLocaleDateString("en-ZA", {
                weekday: "short",
                day: "numeric",
                month: "short",
              }),
              time: selectedCls.time,
              trainer: selectedCls.trainer,
              category: selectedCls.category,
            },
          ]);
        }

        // Notify member
        await Promise.resolve(
          push(ref(db, `users/${selectedUid}/notifications`), {
            title: "Booking Confirmed",
            body: `Your booking for ${selectedCls.name} on ${bookingDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })} at ${selectedCls.time} has been confirmed.`,
            type: "class_update",
            read: false,
            createdAt: Date.now(),
          }),
        );

        toast(
          `${selectedMember.name} booked into ${selectedCls.name} ✓`,
          "success",
        );
      }

      setSelectedUid("");
      setSelectedClsId("");
      setPayNote("Cash payment at reception");
    } catch (err: any) {
      toast(err?.message ?? "Booking failed — try again", "error");
    }
    setSubmitting(false);
  };

  // ── Mini calendar ─────────────────────────────────────────────────────────
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
  const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Manual Cash Booking
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Add a member or non-member to a class when they pay cash at reception.
        Category rules apply — monthly and daily limits are skipped.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Left — member + date */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Member picker */}
          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              1. Select member
            </div>
            {loading ? (
              <div
                style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}
              >
                Loading…
              </div>
            ) : (
              <select
                style={inp}
                value={selectedUid}
                onChange={(e) => {
                  setSelectedUid(e.target.value);
                  setSelectedClsId("");
                }}
              >
                <option value="">— Choose member —</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name} ({m.email}) —{" "}
                    {m.membership === "basic"
                      ? `🎟 ${m.classCredits} credits`
                      : m.membership}
                  </option>
                ))}
              </select>
            )}
            {selectedMember && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "hsl(var(--background))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700 }}>{selectedMember.name}</div>
                <div
                  style={{
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 2,
                  }}
                >
                  {selectedMember.email}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "hsl(20 100% 50% / 0.12)",
                      color: "hsl(20 100% 50%)",
                    }}
                  >
                    {selectedMember.membership}
                  </span>
                  {isNonMember && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background:
                          selectedMember.classCredits > 0
                            ? "hsl(142 72% 37% / 0.12)"
                            : "hsl(38 92% 44% / 0.12)",
                        color:
                          selectedMember.classCredits > 0
                            ? "hsl(142 72% 37%)"
                            : "hsl(38 92% 44%)",
                      }}
                    >
                      🎟 {selectedMember.classCredits} credits{" "}
                      {selectedMember.classCredits === 0
                        ? "— cash override"
                        : "— 1 will be deducted"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mini calendar */}
          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              2. Pick a date
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear((y) => y - 1);
                  } else setCalMonth((m) => m - 1);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 16,
                  padding: "2px 8px",
                }}
              >
                ←
              </button>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {MONTH_NAMES[calMonth]} {calYear}
              </div>
              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear((y) => y + 1);
                  } else setCalMonth((m) => m + 1);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 16,
                  padding: "2px 8px",
                }}
              >
                →
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                marginBottom: 4,
              }}
            >
              {DAY_NAMES_SHORT.map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    padding: "2px 0",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                gap: 2,
              }}
            >
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const d = new Date(calYear, calMonth, day);
                d.setHours(0, 0, 0, 0);
                const isToday = d.getTime() === today.getTime();
                const isSel = d.toISOString().split("T")[0] === selectedDateKey;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setBookingDate(new Date(calYear, calMonth, day));
                      setSelectedClsId("");
                    }}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      background: isSel
                        ? "hsl(20 100% 50%)"
                        : isToday
                          ? "hsl(20 100% 50% / 0.15)"
                          : "transparent",
                      color: isSel
                        ? "#000"
                        : isToday
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--foreground))",
                      outline:
                        isToday && !isSel
                          ? "1px solid hsl(20 100% 50%)"
                          : "none",
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
              }}
            >
              Selected:{" "}
              <strong style={{ color: "hsl(20 100% 50%)" }}>
                {bookingDate.toLocaleDateString("en-ZA", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
            </div>
          </div>
        </div>

        {/* Right — class picker + confirm */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              3. Select class
            </div>
            {classesOnDate.length === 0 ? (
              <div
                style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
              >
                No classes on this date.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {classesOnDate.map((cls) => {
                  const isSelected = selectedClsId === cls.id;
                  const blocked =
                    selectedMember &&
                    selectedMember.membership !== "basic" &&
                    !isCategoryAllowed(selectedMember.membership, cls.category);
                  const full = (cls.bookedCount ?? 0) >= cls.spots;
                  return (
                    <button
                      key={cls.id}
                      onClick={() => !blocked && setSelectedClsId(cls.id)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: `1px solid ${isSelected ? "hsl(20 100% 50%)" : "hsl(var(--border))"}`,
                        background: isSelected
                          ? "hsl(20 100% 50% / 0.1)"
                          : "hsl(var(--background))",
                        cursor: blocked ? "not-allowed" : "pointer",
                        opacity: blocked ? 0.4 : 1,
                        textAlign: "left",
                        fontFamily: "var(--font-body)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: isSelected
                              ? "hsl(20 100% 50%)"
                              : "hsl(var(--foreground))",
                          }}
                        >
                          {cls.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "hsl(var(--muted-foreground))",
                            marginTop: 2,
                          }}
                        >
                          {cls.time} · {cls.trainer} · {cls.category}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: full ? "hsl(0 84% 51%)" : "hsl(142 72% 37%)",
                          }}
                        >
                          {cls.bookedCount ?? 0}/{cls.spots}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          {full ? "Full → waitlist" : "Available"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedCls && (
            <div
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                padding: "14px 16px",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                4. Confirm booking
              </div>
              <div
                style={{
                  padding: "10px 14px",
                  background: "hsl(var(--background))",
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 12,
                  lineHeight: 1.9,
                }}
              >
                <div>
                  <strong>Member:</strong> {selectedMember?.name ?? "—"}
                </div>
                <div>
                  <strong>Class:</strong> {selectedCls.name} ·{" "}
                  {selectedCls.time}
                </div>
                <div>
                  <strong>Date:</strong>{" "}
                  {bookingDate.toLocaleDateString("en-ZA", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </div>
                <div>
                  <strong>Trainer:</strong> {selectedCls.trainer}
                </div>
                {(selectedCls.bookedCount ?? 0) >= selectedCls.spots && (
                  <div
                    style={{
                      color: "hsl(38 92% 44%)",
                      fontWeight: 700,
                      marginTop: 4,
                    }}
                  >
                    ⚠ Class is full — member will be added to waitlist
                  </div>
                )}
                {categoryBlocked && (
                  <div
                    style={{
                      color: "hsl(0 84% 51%)",
                      fontWeight: 700,
                      marginTop: 4,
                    }}
                  >
                    ✕ {selectedCls.category} not allowed for{" "}
                    {selectedMember?.membership} tier
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Payment note</label>
                <input
                  style={inp}
                  placeholder="e.g. Cash payment at reception — R250"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </div>
              <Btn
                variant="primary"
                onClick={handleBook}
                disabled={
                  submitting ||
                  !selectedUid ||
                  !selectedClsId ||
                  !!categoryBlocked
                }
                full
              >
                {submitting
                  ? "Booking…"
                  : (selectedCls.bookedCount ?? 0) >= selectedCls.spots
                    ? "➕ Add to Waitlist"
                    : "✓ Confirm Cash Booking"}
              </Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CREDIT HISTORY + REVENUE SUMMARY
// Paste above export function Admin() in Admin.tsx
//
// Reads from:
//   pending_bookings/  — PayFast transactions (class + pack purchases)
//   mk2_users/{uid}/creditHistory — all credit movements per member
//
// WIRE UP:
// 1. NAV: in NAV_GROUPS "Admin" group items add:
//      { id: "revenue", icon: "ti-report-money", label: "Revenue" },
//
// 2. ROUTE: in Admin() motion.div block add:
//      {tab === "revenue" && <RevenueManager toast={toast} />}
// =============================================================================

function RevenueManager({ toast }: any) {
  const [subTab, setSubTab] = useState<"revenue" | "history">("revenue");

  // ── Revenue state ─────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txFilter, setTxFilter] = useState<
    "all" | "class_booking" | "credit_pack"
  >("all");

  // ── Credit history state ──────────────────────────────────────────────────
  const [members, setMembers] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");

  // ── Load PayFast transactions ─────────────────────────────────────────────
  const loadTransactions = async () => {
    setTxLoading(true);
    try {
      const snap = await get(ref(db, "pending_bookings"));
      if (!snap.exists()) {
        setTransactions([]);
        setTxLoading(false);
        return;
      }
      const list: any[] = [];
      Object.entries(snap.val()).forEach(([key, v]: [string, any]) => {
        // Only show completed payments
        if (v.status === "confirmed") {
          list.push({ key, ...v });
        }
      });
      list.sort(
        (a, b) =>
          (b.confirmedAt ?? b.createdAt ?? 0) -
          (a.confirmedAt ?? a.createdAt ?? 0),
      );
      setTransactions(list);
    } catch {
      toast("Failed to load transactions", "error");
    }
    setTxLoading(false);
  };

  // ── Load members for history picker ───────────────────────────────────────
  const loadMembers = async () => {
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) return;
      const list = Object.entries(snap.val()).map(
        ([uid, v]: [string, any]) => ({
          uid,
          name: v.name || "Unnamed",
          email: v.email || "",
          classCredits: v.classCredits ?? 0,
        }),
      );
      setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    loadTransactions();
    loadMembers();
  }, []);

  // ── Load credit history for selected member ───────────────────────────────
  useEffect(() => {
    if (!selectedUid) {
      setHistory([]);
      return;
    }
    setHistLoading(true);
    get(ref(db, `mk2_users/${selectedUid}/creditHistory`)).then((snap) => {
      if (!snap.exists()) {
        setHistory([]);
        setHistLoading(false);
        return;
      }
      const list = Object.entries(snap.val()).map(
        ([key, v]: [string, any]) => ({
          key,
          ...v,
        }),
      );
      list.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      setHistory(list);
      setHistLoading(false);
    });
  }, [selectedUid]);

  // ── Revenue calculations ──────────────────────────────────────────────────
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const confirmed = transactions; // already filtered to confirmed above

  const totalRevenue = confirmed.reduce((s, t) => s + (t.price ?? 0), 0);
  const thisMonthRev = confirmed
    .filter(
      (t) =>
        new Date(t.confirmedAt ?? t.createdAt ?? 0)
          .toISOString()
          .slice(0, 7) === thisMonth,
    )
    .reduce((s, t) => s + (t.price ?? 0), 0);
  const lastMonthRev = confirmed
    .filter(
      (t) =>
        new Date(t.confirmedAt ?? t.createdAt ?? 0)
          .toISOString()
          .slice(0, 7) === lastMonth,
    )
    .reduce((s, t) => s + (t.price ?? 0), 0);
  const classBookingRev = confirmed
    .filter((t) => t.custom_str2 === "class_booking" || !t.creditsPurchased)
    .reduce((s, t) => s + (t.price ?? 0), 0);
  const packRev = confirmed
    .filter((t) => t.creditsPurchased)
    .reduce((s, t) => s + (t.price ?? 0), 0);

  // Monthly breakdown
  const byMonth: Record<string, number> = {};
  confirmed.forEach((t) => {
    const mo = new Date(t.confirmedAt ?? t.createdAt ?? 0)
      .toISOString()
      .slice(0, 7);
    byMonth[mo] = (byMonth[mo] ?? 0) + (t.price ?? 0);
  });
  const monthlyBreakdown = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6);

  // Filtered transactions list
  const filteredTx =
    txFilter === "all"
      ? confirmed
      : txFilter === "credit_pack"
        ? confirmed.filter((t) => t.creditsPurchased)
        : confirmed.filter((t) => !t.creditsPurchased);

  // Credit history type labels
  const CREDIT_TYPE_META: Record<string, { label: string; color: string }> = {
    pack_purchase: { label: "Pack purchase", color: "hsl(142 72% 37%)" },
    class_spend: { label: "Class booked", color: "hsl(0 84% 51%)" },
    admin_assign: { label: "Admin assigned", color: "hsl(217 91% 53%)" },
    admin_cancel: { label: "Admin cancelled", color: "hsl(38 92% 44%)" },
    user_cancel: { label: "User cancelled", color: "hsl(38 92% 44%)" },
  };

  const historyTypes = ["all", ...Object.keys(CREDIT_TYPE_META)];
  const filteredHistory =
    typeFilter === "all"
      ? history
      : history.filter((h) => h.type === typeFilter);

  const selectedMember = members.find((m) => m.uid === selectedUid);

  // ── Shared styles ─────────────────────────────────────────────────────────
  const S: any = {
    card: {
      background: "hsl(var(--secondary))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 12,
      padding: "14px 18px",
    },
    th: {
      textAlign: "left" as const,
      padding: "6px 10px",
      fontWeight: 700,
      fontSize: 10,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: "hsl(var(--muted-foreground))",
      borderBottom: "1px solid hsl(var(--border))",
    },
    td: {
      padding: "8px 10px",
      borderBottom: "1px solid hsl(var(--border))",
      fontSize: 12,
      verticalAlign: "top" as const,
    },
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Revenue & Credit History
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        PayFast transaction log and per-member credit movement history.
      </div>

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          { id: "revenue" as const, label: "💰 Revenue" },
          { id: "history" as const, label: "🎟 Credit History" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background: subTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color: subTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REVENUE TAB ── */}
      {subTab === "revenue" && (
        <div>
          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              {
                label: "Total revenue",
                val: `R${totalRevenue.toLocaleString("en-ZA")}`,
                accent: true,
              },
              {
                label: "This month",
                val: `R${thisMonthRev.toLocaleString("en-ZA")}`,
                accent: false,
              },
              {
                label: "Last month",
                val: `R${lastMonthRev.toLocaleString("en-ZA")}`,
                accent: false,
              },
              {
                label: "Class bookings",
                val: `R${classBookingRev.toLocaleString("en-ZA")}`,
                accent: false,
              },
              {
                label: "Credit packs",
                val: `R${packRev.toLocaleString("en-ZA")}`,
                accent: false,
              },
              {
                label: "Total transactions",
                val: String(confirmed.length),
                accent: false,
              },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  ...S.card,
                  borderLeft: s.accent
                    ? "3px solid hsl(20 100% 50%)"
                    : undefined,
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: s.accent
                      ? "hsl(20 100% 50%)"
                      : "hsl(var(--foreground))",
                    lineHeight: 1,
                  }}
                >
                  {txLoading ? "—" : s.val}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 6,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Monthly breakdown */}
          {!txLoading && monthlyBreakdown.length > 0 && (
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                Monthly breakdown
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {monthlyBreakdown.map(([mo, rev]) => {
                  const maxRev = Math.max(
                    ...monthlyBreakdown.map(([, r]) => r),
                  );
                  const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
                  const [yr, mn] = mo.split("-");
                  const label = new Date(
                    Number(yr),
                    Number(mn) - 1,
                    1,
                  ).toLocaleDateString("en-ZA", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <div key={mo}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            color:
                              mo === thisMonth
                                ? "hsl(20 100% 50%)"
                                : "hsl(var(--foreground))",
                            fontWeight: mo === thisMonth ? 700 : 400,
                          }}
                        >
                          {label}
                        </span>
                        <span style={{ fontWeight: 700 }}>
                          R{rev.toLocaleString("en-ZA")}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "hsl(var(--border))",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background:
                              mo === thisMonth
                                ? "hsl(20 100% 50%)"
                                : "hsl(217 91% 53%)",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transaction list */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {(["all", "class_booking", "credit_pack"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTxFilter(f)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  background:
                    txFilter === f
                      ? "hsl(20 100% 50%)"
                      : "hsl(var(--secondary))",
                  color: txFilter === f ? "#000" : "hsl(var(--foreground))",
                  border:
                    txFilter === f ? "none" : "1px solid hsl(var(--border))",
                  fontFamily: "var(--font-body)",
                }}
              >
                {f === "all"
                  ? `All (${confirmed.length})`
                  : f === "credit_pack"
                    ? "Credit packs"
                    : "Class bookings"}
              </button>
            ))}
            <Btn variant="subtle" size="sm" onClick={loadTransactions}>
              ↻ Refresh
            </Btn>
          </div>

          {txLoading ? (
            <div
              style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}
            >
              Loading…
            </div>
          ) : filteredTx.length === 0 ? (
            <div
              style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}
            >
              No transactions yet.
            </div>
          ) : (
            <div style={{ ...S.card, overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    <th style={S.th}>Member</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Description</th>
                    <th style={S.th}>Amount</th>
                    <th style={S.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.map((t) => {
                    const isPack = Boolean(t.creditsPurchased);
                    const date = new Date(t.confirmedAt ?? t.createdAt ?? 0);
                    return (
                      <tr key={t.key}>
                        <td style={S.td}>
                          <div style={{ fontWeight: 700 }}>
                            {t.userName ?? "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            {t.userEmail ?? ""}
                          </div>
                        </td>
                        <td style={S.td}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: isPack
                                ? "hsl(142 72% 37% / 0.12)"
                                : "hsl(20 100% 50% / 0.12)",
                              color: isPack
                                ? "hsl(142 72% 37%)"
                                : "hsl(20 100% 50%)",
                            }}
                          >
                            {isPack ? "Credit pack" : "Class booking"}
                          </span>
                        </td>
                        <td style={S.td}>
                          {isPack
                            ? `${t.className} · ${t.creditsPurchased} credits`
                            : `${t.className} · ${t.dateDisplay ?? t.dateKey}`}
                        </td>
                        <td
                          style={{
                            ...S.td,
                            fontWeight: 700,
                            color: "hsl(20 100% 50%)",
                          }}
                        >
                          R{(t.price ?? 0).toLocaleString("en-ZA")}
                        </td>
                        <td
                          style={{
                            ...S.td,
                            color: "hsl(var(--muted-foreground))",
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          {date.toLocaleDateString("en-ZA", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Total row */}
                <tfoot>
                  <tr>
                    <td
                      colSpan={3}
                      style={{
                        ...S.td,
                        fontWeight: 700,
                        borderBottom: "none",
                        borderTop: "2px solid hsl(var(--border))",
                      }}
                    >
                      Total ({filteredTx.length} transactions)
                    </td>
                    <td
                      style={{
                        ...S.td,
                        fontWeight: 700,
                        color: "hsl(20 100% 50%)",
                        borderBottom: "none",
                        borderTop: "2px solid hsl(var(--border))",
                      }}
                    >
                      R
                      {filteredTx
                        .reduce((s, t) => s + (t.price ?? 0), 0)
                        .toLocaleString("en-ZA")}
                    </td>
                    <td
                      style={{
                        ...S.td,
                        borderBottom: "none",
                        borderTop: "2px solid hsl(var(--border))",
                      }}
                    />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CREDIT HISTORY TAB ── */}
      {subTab === "history" && (
        <div>
          {/* Member picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Select member</label>
            <select
              style={{ ...inp, maxWidth: 420 }}
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
            >
              <option value="">— Choose a member —</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} ({m.email}) — 🎟 {m.classCredits} credits
                </option>
              ))}
            </select>
          </div>

          {selectedMember && (
            <>
              {/* Member credit summary */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  {
                    label: "Current credits",
                    val: String(selectedMember.classCredits),
                    accent: true,
                  },
                  {
                    label: "Total earned",
                    val: String(
                      history
                        .filter((h) => h.amount > 0)
                        .reduce((s, h) => s + h.amount, 0),
                    ),
                    accent: false,
                  },
                  {
                    label: "Total spent",
                    val: String(
                      Math.abs(
                        history
                          .filter((h) => h.amount < 0)
                          .reduce((s, h) => s + h.amount, 0),
                      ),
                    ),
                    accent: false,
                  },
                  {
                    label: "Transactions",
                    val: String(history.length),
                    accent: false,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      ...S.card,
                      borderLeft: s.accent
                        ? "3px solid hsl(20 100% 50%)"
                        : undefined,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.accent
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--foreground))",
                        lineHeight: 1,
                      }}
                    >
                      {histLoading ? "—" : s.val}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        marginTop: 6,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Type filter */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                {historyTypes.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      textTransform: "capitalize",
                      background:
                        typeFilter === t
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--secondary))",
                      color:
                        typeFilter === t ? "#000" : "hsl(var(--foreground))",
                      border:
                        typeFilter === t
                          ? "none"
                          : "1px solid hsl(var(--border))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {t === "all" ? "All" : (CREDIT_TYPE_META[t]?.label ?? t)}
                  </button>
                ))}
              </div>

              {/* History list */}
              {histLoading ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Loading…
                </div>
              ) : filteredHistory.length === 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  No credit history for this member.
                </div>
              ) : (
                <div style={{ ...S.card, padding: "4px 16px" }}>
                  {filteredHistory.map((h, i) => {
                    const meta = CREDIT_TYPE_META[h.type] ?? {
                      label: h.type,
                      color: "hsl(var(--muted-foreground))",
                    };
                    const isLast = i === filteredHistory.length - 1;
                    const isCredit = h.amount > 0;
                    return (
                      <div
                        key={h.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 0",
                          borderBottom: isLast
                            ? "none"
                            : "1px solid hsl(var(--border))",
                        }}
                      >
                        {/* Amount indicator */}
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 10,
                            background: isCredit
                              ? "hsl(142 72% 37% / 0.12)"
                              : h.amount === 0
                                ? "hsl(217 91% 53% / 0.12)"
                                : "hsl(0 84% 51% / 0.12)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 15,
                            color: isCredit
                              ? "hsl(142 72% 37%)"
                              : h.amount === 0
                                ? "hsl(217 91% 53%)"
                                : "hsl(0 84% 51%)",
                            flexShrink: 0,
                          }}
                        >
                          {h.amount > 0
                            ? `+${h.amount}`
                            : h.amount === 0
                              ? "—"
                              : h.amount}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                              marginBottom: 2,
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 13 }}>
                              {meta.label}
                            </span>
                            {h.cashOverride && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: 20,
                                  background: "hsl(38 92% 44% / 0.12)",
                                  color: "hsl(38 92% 44%)",
                                }}
                              >
                                cash override
                              </span>
                            )}
                            {h.adminAssigned && !h.cashOverride && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: 20,
                                  background: "hsl(217 91% 53% / 0.12)",
                                  color: "hsl(217 91% 53%)",
                                }}
                              >
                                admin
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "hsl(var(--muted-foreground))",
                              lineHeight: 1.5,
                            }}
                          >
                            {h.note}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "hsl(var(--muted-foreground))",
                            flexShrink: 0,
                            textAlign: "right" as const,
                          }}
                        >
                          {h.timestamp
                            ? new Date(h.timestamp).toLocaleDateString(
                                "en-ZA",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
function BookingExports({ toast }: any) {
  const [subTab, setSubTab] = useState<"roster" | "members" | "checkins">(
    "roster",
  );

  // ── Roster state ─────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<any[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [rosterDate, setRosterDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [rosterClassId, setRosterClassId] = useState("");
  const [rosterData, setRosterData] = useState<any[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterClass, setRosterClass] = useState<any>(null);

  // ── Member list state ─────────────────────────────────────────────────────
  const [memberExportLoading, setMemberExportLoading] = useState(false);
  const [memberPreview, setMemberPreview] = useState<any[]>([]);
  const [memberPreviewLoaded, setMemberPreviewLoaded] = useState(false);

  // ── Check-in history state ────────────────────────────────────────────────
  const [ciFrom, setCiFrom] = useState("");
  const [ciTo, setCiTo] = useState("");
  const [ciLoading, setCiLoading] = useState(false);
  const [ciPreview, setCiPreview] = useState<any[]>([]);
  const [ciPreviewLoaded, setCiPreviewLoaded] = useState(false);

  // ── Calendar for roster ───────────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(rosterDate.getMonth());
  const [calYear, setCalYear] = useState(rosterDate.getFullYear());

  useEffect(() => {
    get(ref(db, "admin_classes")).then((snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([id, v]: [string, any]) => ({ id, ...v }),
        );
        setClasses(
          list.sort((a, b) => (a.time || "").localeCompare(b.time || "")),
        );
      }
      setClassesLoading(false);
    });
  }, []);

  // Classes on selected roster date
  const selectedDateKey = formatDateKey(rosterDate);
  const selectedDayName = getDayName(rosterDate);
  const classesOnDate = classes
    .filter((c) =>
      c.scheduleType === "date"
        ? c.specificDate === selectedDateKey
        : c.day === selectedDayName,
    )
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  // ── Load roster ───────────────────────────────────────────────────────────
  const loadRoster = async () => {
    if (!rosterClassId) return toast("Select a class first", "error");
    const cls = classes.find((c) => c.id === rosterClassId);
    if (!cls) return;
    setRosterLoading(true);
    setRosterClass(cls);
    try {
      const bk = buildBookingKey(cls.name, selectedDateKey);
      const snap = await get(ref(db, `class_bookings/${bk}`));
      if (!snap.exists()) {
        setRosterData([]);
      } else {
        const rows = Object.entries(snap.val()).map(
          ([uid, v]: [string, any]) => ({
            uid,
            name: v.name || "Unknown",
            email: v.email || "",
          }),
        );
        setRosterData(rows.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      toast("Failed to load roster", "error");
    }
    setRosterLoading(false);
  };

  const exportRosterCSV = () => {
    if (!rosterClass) return;
    const rows = [
      ["#", "Name", "Email", "Class", "Date", "Time", "Trainer"],
      ...rosterData.map((r, i) => [
        String(i + 1),
        r.name,
        r.email,
        rosterClass.name,
        selectedDateKey,
        rosterClass.time,
        rosterClass.trainer,
      ]),
    ];
    downloadCSV(`roster_${rosterClass.name}_${selectedDateKey}.csv`, rows);
    toast("CSV downloaded ✓", "success");
  };

  const exportRosterPrint = () => {
    if (!rosterClass) return;
    const rows = rosterData
      .map(
        (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${r.name}</td>
          <td>${r.email}</td>
          <td style="text-align:center">☐</td>
        </tr>`,
      )
      .join("");
    printHTML(
      `Roster — ${rosterClass.name} ${selectedDateKey}`,
      `<h1>Class Roster</h1>
       <div class="sub">${rosterClass.name} · ${selectedDateKey} · ${rosterClass.time} · Coach ${rosterClass.trainer} · ${rosterData.length}/${rosterClass.spots} booked</div>
       <table>
         <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Present</th></tr></thead>
         <tbody>${rows || "<tr><td colspan='4'>No bookings</td></tr>"}</tbody>
       </table>`,
    );
  };

  // ── Load member list ──────────────────────────────────────────────────────
  const loadMembers = async () => {
    setMemberExportLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setMemberPreview([]);
        setMemberPreviewLoaded(true);
        setMemberExportLoading(false);
        return;
      }
      const list = Object.entries(snap.val()).map(
        ([uid, v]: [string, any]) => ({
          uid,
          name: v.name || "Unnamed",
          email: v.email || "",
          membership: v.membership || "basic",
          points: v.points ?? 0,
          classCredits: v.classCredits ?? 0,
          checkIns: Array.isArray(v.checkIns) ? v.checkIns.length : 0,
          joinedAt: v.createdAt ?? 0,
        }),
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMemberPreview(list);
      setMemberPreviewLoaded(true);
    } catch {
      toast("Failed to load members", "error");
    }
    setMemberExportLoading(false);
  };

  const exportMembersCSV = () => {
    const rows = [
      [
        "Name",
        "Email",
        "Membership",
        "Points",
        "Class Credits",
        "Total Check-Ins",
        "Joined",
      ],
      ...memberPreview.map((m) => [
        m.name,
        m.email,
        m.membership,
        String(m.points),
        String(m.classCredits),
        String(m.checkIns),
        m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("en-ZA") : "",
      ]),
    ];
    downloadCSV(`mk2r_members_${formatDateKey(new Date())}.csv`, rows);
    toast("Members CSV downloaded ✓", "success");
  };

  const exportMembersPrint = () => {
    const rows = memberPreview
      .map(
        (m) => `
        <tr>
          <td>${m.name}</td>
          <td>${m.email}</td>
          <td><span class="badge badge-${m.membership}">${m.membership}</span></td>
          <td style="text-align:center">${m.points}</td>
          <td style="text-align:center">${m.classCredits}</td>
          <td style="text-align:center">${m.checkIns}</td>
        </tr>`,
      )
      .join("");
    printHTML(
      "MK2R Member List",
      `<h1>Member List</h1>
       <div class="sub">${memberPreview.length} members · Exported ${new Date().toLocaleDateString("en-ZA")}</div>
       <table>
         <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Points</th><th>Credits</th><th>Check-Ins</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`,
    );
  };

  // ── Load check-in history ─────────────────────────────────────────────────
  const loadCheckIns = async () => {
    if (!ciFrom || !ciTo) return toast("Select a date range", "error");
    const from = new Date(ciFrom + "T00:00:00");
    const to = new Date(ciTo + "T23:59:59");
    if (from > to) return toast("From date must be before To date", "error");
    setCiLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setCiPreview([]);
        setCiPreviewLoaded(true);
        setCiLoading(false);
        return;
      }
      const rows: any[] = [];
      Object.entries(snap.val()).forEach(([, v]: [string, any]) => {
        const checkIns: any[] = Array.isArray(v.checkIns) ? v.checkIns : [];
        checkIns.forEach((ci: any) => {
          if (!ci?.date) return;
          // Parse DD/MM/YYYY
          const [d, mo, yr] = ci.date.split("/");
          const ciDate = new Date(`${yr}-${mo}-${d}T00:00:00`);
          if (ciDate >= from && ciDate <= to) {
            rows.push({
              name: v.name || "Unnamed",
              email: v.email || "",
              date: ci.date,
              time: ci.time || "—",
              backdated: ci.backdated ? "Yes" : "No",
              // For sorting
              _ts: ciDate.getTime(),
            });
          }
        });
      });
      rows.sort((a, b) => a._ts - b._ts || a.name.localeCompare(b.name));
      setCiPreview(rows);
      setCiPreviewLoaded(true);
    } catch {
      toast("Failed to load check-ins", "error");
    }
    setCiLoading(false);
  };

  const exportCheckInsCSV = () => {
    const rows = [
      ["Name", "Email", "Date", "Time", "Backdated"],
      ...ciPreview.map((r) => [r.name, r.email, r.date, r.time, r.backdated]),
    ];
    downloadCSV(`mk2r_checkins_${ciFrom}_to_${ciTo}.csv`, rows);
    toast("Check-ins CSV downloaded ✓", "success");
  };

  const exportCheckInsPrint = () => {
    const tableRows = ciPreview
      .map(
        (r) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.email}</td>
          <td>${r.date}</td>
          <td>${r.time}</td>
          <td>${r.backdated}</td>
        </tr>`,
      )
      .join("");
    printHTML(
      `Check-In History ${ciFrom} – ${ciTo}`,
      `<h1>Check-In History</h1>
       <div class="sub">${ciPreview.length} entries · ${ciFrom} to ${ciTo}</div>
       <table>
         <thead><tr><th>Name</th><th>Email</th><th>Date</th><th>Time</th><th>Backdated</th></tr></thead>
         <tbody>${tableRows || "<tr><td colspan='5'>No check-ins in range</td></tr>"}</tbody>
       </table>`,
    );
  };

  // ── Mini calendar for roster ──────────────────────────────────────────────
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
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // shared styles
  const S: any = {
    card: {
      background: "hsl(var(--secondary))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 12,
      padding: "16px 18px",
      marginBottom: 16,
    },
    sectionTitle: { fontWeight: 700, fontSize: 13, marginBottom: 10 },
    exportRow: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap" as const,
      marginTop: 14,
    },
    empty: {
      fontSize: 13,
      color: "hsl(var(--muted-foreground))",
      padding: "16px 0",
    },
    previewTable: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: 12,
      marginTop: 10,
    },
    th: {
      textAlign: "left" as const,
      padding: "6px 10px",
      fontWeight: 700,
      fontSize: 10,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      color: "hsl(var(--muted-foreground))",
      borderBottom: "1px solid hsl(var(--border))",
    },
    td: {
      padding: "7px 10px",
      borderBottom: "1px solid hsl(var(--border))",
      fontSize: 12,
    },
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Exports
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Download class rosters, member lists, and check-in history as CSV or
        printable sheets.
      </div>

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          { id: "roster" as const, label: "📋 Class roster" },
          { id: "members" as const, label: "👥 Member list" },
          { id: "checkins" as const, label: "✅ Check-in history" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background: subTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color: subTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CLASS ROSTER ── */}
      {subTab === "roster" && (
        <div>
          {/* Mini calendar */}
          <div style={{ ...S.card, maxWidth: 340 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear((y) => y - 1);
                  } else setCalMonth((m) => m - 1);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 16,
                  padding: "2px 8px",
                }}
              >
                ←
              </button>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {MONTH_NAMES[calMonth]} {calYear}
              </div>
              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear((y) => y + 1);
                  } else setCalMonth((m) => m + 1);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontSize: 16,
                  padding: "2px 8px",
                }}
              >
                →
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                marginBottom: 4,
              }}
            >
              {DAY_NAMES.map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "hsl(var(--muted-foreground))",
                    padding: "2px 0",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7,1fr)",
                gap: 2,
              }}
            >
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const d = new Date(calYear, calMonth, day);
                d.setHours(0, 0, 0, 0);
                const isToday = d.getTime() === today.getTime();
                const isSel = formatDateKey(d) === formatDateKey(rosterDate);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setRosterDate(new Date(calYear, calMonth, day));
                      setRosterClassId("");
                      setRosterData([]);
                      setRosterClass(null);
                    }}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: "none",
                      background: isSel
                        ? "hsl(20 100% 50%)"
                        : isToday
                          ? "hsl(20 100% 50% / 0.15)"
                          : "transparent",
                      color: isSel
                        ? "#000"
                        : isToday
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--foreground))",
                      outline:
                        isToday && !isSel
                          ? "1px solid hsl(20 100% 50%)"
                          : "none",
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Class picker */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>
              Class on{" "}
              {rosterDate.toLocaleDateString("en-ZA", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </label>
            {classesLoading ? (
              <div style={S.empty}>Loading classes…</div>
            ) : classesOnDate.length === 0 ? (
              <div style={{ ...S.empty, padding: "10px 0" }}>
                No classes on this date.
              </div>
            ) : (
              <select
                style={{ ...inp, maxWidth: 400 }}
                value={rosterClassId}
                onChange={(e) => {
                  setRosterClassId(e.target.value);
                  setRosterData([]);
                  setRosterClass(null);
                }}
              >
                <option value="">— Select a class —</option>
                {classesOnDate.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.time} · {c.name} · {c.trainer}
                  </option>
                ))}
              </select>
            )}
          </div>

          <Btn
            variant="primary"
            size="sm"
            onClick={loadRoster}
            disabled={!rosterClassId || rosterLoading}
          >
            {rosterLoading ? "Loading…" : "Load Roster"}
          </Btn>

          {/* Roster preview */}
          {rosterClass && !rosterLoading && (
            <div style={{ ...S.card, marginTop: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <div>
                  <div style={S.sectionTitle}>
                    {rosterClass.name} — {selectedDateKey}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    {rosterClass.time} · Coach {rosterClass.trainer} ·{" "}
                    {rosterData.length}/{rosterClass.spots} booked
                  </div>
                </div>
                <div style={S.exportRow}>
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={exportRosterCSV}
                    disabled={rosterData.length === 0}
                  >
                    ⬇ CSV
                  </Btn>
                  <Btn variant="subtle" size="sm" onClick={exportRosterPrint}>
                    🖨 Print / PDF
                  </Btn>
                </div>
              </div>

              {rosterData.length === 0 ? (
                <div style={S.empty}>
                  No bookings for this class on this date.
                </div>
              ) : (
                <table style={S.previewTable}>
                  <thead>
                    <tr>
                      <th style={S.th}>#</th>
                      <th style={S.th}>Name</th>
                      <th style={S.th}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rosterData.map((r, i) => (
                      <tr key={r.uid}>
                        <td
                          style={{
                            ...S.td,
                            color: "hsl(var(--muted-foreground))",
                            width: 32,
                          }}
                        >
                          {i + 1}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{r.name}</td>
                        <td
                          style={{
                            ...S.td,
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          {r.email}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MEMBER LIST ── */}
      {subTab === "members" && (
        <div>
          <div style={S.card}>
            <div style={S.sectionTitle}>Export all app users</div>
            <div
              style={{
                fontSize: 12,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 14,
              }}
            >
              Includes name, email, membership tier, points, class credits,
              total check-ins and join date.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                variant="primary"
                size="sm"
                onClick={loadMembers}
                disabled={memberExportLoading}
              >
                {memberExportLoading
                  ? "Loading…"
                  : memberPreviewLoaded
                    ? "↻ Refresh"
                    : "Load Members"}
              </Btn>
              {memberPreviewLoaded && (
                <>
                  <Btn variant="primary" size="sm" onClick={exportMembersCSV}>
                    ⬇ CSV
                  </Btn>
                  <Btn variant="subtle" size="sm" onClick={exportMembersPrint}>
                    🖨 Print / PDF
                  </Btn>
                </>
              )}
            </div>
          </div>

          {memberPreviewLoaded && (
            <div style={S.card}>
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 10,
                }}
              >
                {memberPreview.length} members
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={S.previewTable}>
                  <thead>
                    <tr>
                      <th style={S.th}>Name</th>
                      <th style={S.th}>Email</th>
                      <th style={S.th}>Tier</th>
                      <th style={S.th}>Points</th>
                      <th style={S.th}>Credits</th>
                      <th style={S.th}>Check-ins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberPreview.map((m) => (
                      <tr key={m.uid}>
                        <td style={{ ...S.td, fontWeight: 700 }}>{m.name}</td>
                        <td
                          style={{
                            ...S.td,
                            color: "hsl(var(--muted-foreground))",
                          }}
                        >
                          {m.email}
                        </td>
                        <td style={S.td}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background:
                                m.membership === "gold"
                                  ? "hsl(38 92% 44% / 0.15)"
                                  : m.membership === "silver"
                                    ? "hsl(var(--secondary))"
                                    : "hsl(var(--secondary))",
                              color:
                                m.membership === "gold"
                                  ? "hsl(38 92% 44%)"
                                  : "hsl(var(--muted-foreground))",
                            }}
                          >
                            {m.membership}
                          </span>
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          {m.points}
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          {m.classCredits}
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          {m.checkIns}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CHECK-IN HISTORY ── */}
      {subTab === "checkins" && (
        <div>
          <div style={S.card}>
            <div style={S.sectionTitle}>
              Export check-in history by date range
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={lbl}>From *</label>
                <input
                  style={inp}
                  type="date"
                  value={ciFrom}
                  onChange={(e) => {
                    setCiFrom(e.target.value);
                    setCiPreviewLoaded(false);
                  }}
                />
              </div>
              <div>
                <label style={lbl}>To *</label>
                <input
                  style={inp}
                  type="date"
                  value={ciTo}
                  onChange={(e) => {
                    setCiTo(e.target.value);
                    setCiPreviewLoaded(false);
                  }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                variant="primary"
                size="sm"
                onClick={loadCheckIns}
                disabled={ciLoading || !ciFrom || !ciTo}
              >
                {ciLoading ? "Loading…" : "Load Check-Ins"}
              </Btn>
              {ciPreviewLoaded && (
                <>
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={exportCheckInsCSV}
                    disabled={ciPreview.length === 0}
                  >
                    ⬇ CSV
                  </Btn>
                  <Btn variant="subtle" size="sm" onClick={exportCheckInsPrint}>
                    🖨 Print / PDF
                  </Btn>
                </>
              )}
            </div>
          </div>

          {ciPreviewLoaded && (
            <div style={S.card}>
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 10,
                }}
              >
                {ciPreview.length} check-in{ciPreview.length !== 1 ? "s" : ""}{" "}
                between {ciFrom} and {ciTo}
              </div>
              {ciPreview.length === 0 ? (
                <div style={S.empty}>
                  No check-ins found in this date range.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={S.previewTable}>
                    <thead>
                      <tr>
                        <th style={S.th}>Name</th>
                        <th style={S.th}>Email</th>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Time</th>
                        <th style={S.th}>Backdated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ciPreview.map((r, i) => (
                        <tr key={i}>
                          <td style={{ ...S.td, fontWeight: 700 }}>{r.name}</td>
                          <td
                            style={{
                              ...S.td,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            {r.email}
                          </td>
                          <td style={S.td}>{r.date}</td>
                          <td style={S.td}>{r.time}</td>
                          <td style={S.td}>
                            {r.backdated === "Yes" && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "2px 8px",
                                  borderRadius: 20,
                                  background: "hsl(38 92% 44% / 0.12)",
                                  color: "hsl(38 92% 44%)",
                                }}
                              >
                                backdated
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Social Media Manager ──────────────────────────────────────────────────────
function SocialMediaManager({ toast }: any) {
  const [socialsTab, setSocialsTab] = useState<"platforms" | "photos">(
    "platforms",
  );

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Social Media Platforms
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Manage your social platform links and photo highlights
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          { id: "platforms" as const, label: "🔗 Platform Links" },
          { id: "photos" as const, label: "🖼 Photo Highlights" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSocialsTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background:
                socialsTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color:
                socialsTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {socialsTab === "platforms" && <PlatformsConfig toast={toast} />}
      {socialsTab === "photos" && <PhotosManager toast={toast} />}
    </div>
  );
}

// ── Platform Links Config ─────────────────────────────────────────────────────
function PlatformsConfig({ toast }: any) {
  const [form, setForm] = useState({
    instagramHandle: "",
    facebookUrl: "",
    tiktokUrl: "",
    facebookEmbedEnabled: false,
    tiktokEmbedEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get(ref(db, "admin_socials")).then((snap) => {
      if (snap.exists()) setForm((p) => ({ ...p, ...snap.val() }));
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await set(ref(db, "admin_socials"), form);
      toast("Social platforms updated ✓", "success");
    } catch {
      toast("Save failed", "error");
    }
    setSaving(false);
  };

  if (loading)
    return (
      <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
        Loading…
      </div>
    );

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Instagram */}
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 12,
          borderLeft: "3px solid hsl(20 100% 50%)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          📸 Instagram
        </div>
        <label style={lbl}>Instagram Handle (without @)</label>
        <input
          style={inp}
          placeholder="mk2riversfitness"
          value={form.instagramHandle}
          onChange={(e) =>
            setForm((p) => ({ ...p, instagramHandle: e.target.value }))
          }
        />
        <div
          style={{
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            marginTop: 6,
          }}
        >
          Feed is powered by Elfsight. The handle here controls the profile link
          shown to members.
        </div>
      </div>

      {/* Facebook */}
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 12,
          borderLeft: "3px solid hsl(217 91% 53%)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          👥 Facebook
        </div>
        <label style={lbl}>Facebook Page URL</label>
        <input
          style={{ ...inp, marginBottom: 12 }}
          placeholder="https://facebook.com/mk2riversfitness"
          value={form.facebookUrl}
          onChange={(e) =>
            setForm((p) => ({ ...p, facebookUrl: e.target.value }))
          }
        />
        <label style={lbl}>Show embedded feed?</label>
        <select
          style={inp}
          value={form.facebookEmbedEnabled ? "true" : "false"}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              facebookEmbedEnabled: e.target.value === "true",
            }))
          }
        >
          <option value="false">No — show link button only</option>
          <option value="true">Yes — embed Facebook feed</option>
        </select>
        <div
          style={{
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            marginTop: 6,
          }}
        >
          Leave URL empty to hide Facebook tab from members entirely.
        </div>
      </div>

      {/* TikTok */}
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          borderLeft: "3px solid hsl(var(--border))",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          🎵 TikTok
        </div>
        <label style={lbl}>TikTok Profile URL</label>
        <input
          style={{ ...inp, marginBottom: 12 }}
          placeholder="https://tiktok.com/@mk2rivers"
          value={form.tiktokUrl}
          onChange={(e) =>
            setForm((p) => ({ ...p, tiktokUrl: e.target.value }))
          }
        />
        <label style={lbl}>Show embedded feed?</label>
        <select
          style={inp}
          value={form.tiktokEmbedEnabled ? "true" : "false"}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              tiktokEmbedEnabled: e.target.value === "true",
            }))
          }
        >
          <option value="false">No — show link button only</option>
          <option value="true">Yes — embed TikTok creator feed</option>
        </select>
        <div
          style={{
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            marginTop: 6,
          }}
        >
          Leave URL empty to hide TikTok tab from members entirely.
        </div>
      </div>

      <Btn variant="primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Platform Settings"}
      </Btn>
    </div>
  );
}

// ── Photo Highlights Manager ──────────────────────────────────────────────────
const GAL_CATS = [
  "Classes",
  "Facilities",
  "Members",
  "Events",
  "Transformation",
];

function PhotosManager({ toast }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blank = { label: "", category: "Classes", desc: "", imageUrl: "" };
  const [form, setForm] = useState(blank);
  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "admin_gallery"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([id, val]: [string, any]) => ({ id, ...val }),
        );
        setItems(list.reverse());
      } else {
        setItems([]);
      }
    } catch {
      toast("Failed to load", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Image must be under 5MB", "error");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const storage = getStorage();
      const fileName = `gallery/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const sRef = storageRef(storage, fileName);
      const uploadTask = uploadBytesResumable(sRef, file);
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          setUploadProgress(
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          );
        },
        () => {
          toast("Upload failed — try again", "error");
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setForm((p) => ({ ...p, imageUrl: url }));
          toast("Image uploaded ✓", "success");
          setUploading(false);
          setUploadProgress(0);
        },
      );
    } catch {
      toast("Upload error", "error");
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.label) return toast("Enter a label", "error");
    if (!form.imageUrl) return toast("Upload an image first", "error");
    try {
      await push(ref(db, "admin_gallery"), { ...form, createdAt: Date.now() });
      toast("Photo added ✓", "success");
      setShowForm(false);
      setForm(blank);
      load();
    } catch {
      toast("Save failed", "error");
    }
  };

  const del = async (item: any) => {
    if (!confirm(`Delete "${item.label}"?`)) return;
    try {
      await remove(ref(db, `admin_gallery/${item.id}`));
      if (item.imageUrl?.includes("firebasestorage")) {
        try {
          const storage = getStorage();
          const fileRef = storageRef(storage, item.imageUrl);
          await deleteObject(fileRef);
        } catch {
          /* non-critical */
        }
      }
      toast("Deleted", "info");
      load();
    } catch {
      toast("Delete failed", "error");
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          Photo Highlights ({items.length})
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={() => {
            setShowForm(!showForm);
            setForm(blank);
          }}
        >
          {showForm ? "✕ Cancel" : "+ Add Photo"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              New Photo
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Photo</label>
              {form.imageUrl ? (
                <div style={{ position: "relative", width: "fit-content" }}>
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    style={{
                      width: 180,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                  <button
                    onClick={() => setForm((p) => ({ ...p, imageUrl: "" }))}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px dashed hsl(var(--border))",
                      background: "hsl(var(--card))",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {uploading
                      ? `Uploading… ${uploadProgress}%`
                      : "📁 Choose image (max 5MB)"}
                  </button>
                  {uploading && (
                    <div
                      style={{
                        marginTop: 8,
                        height: 4,
                        background: "hsl(var(--border))",
                        borderRadius: 2,
                        overflow: "hidden",
                        width: 200,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${uploadProgress}%`,
                          background: "hsl(20 100% 50%)",
                          borderRadius: 2,
                          transition: "width 0.2s",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={lbl}>Label</label>
                <input
                  style={inp}
                  placeholder="e.g. HIIT Session"
                  value={form.label}
                  onChange={f("label")}
                />
              </div>
              <div>
                <label style={lbl}>Category</label>
                <select
                  style={inp}
                  value={form.category}
                  onChange={f("category")}
                >
                  {GAL_CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Description (optional)</label>
              <textarea
                style={{ ...inp, minHeight: 60, resize: "vertical" }}
                placeholder="Describe this photo…"
                value={form.desc}
                onChange={f("desc")}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                variant="primary"
                onClick={save}
                disabled={uploading || !form.imageUrl}
              >
                Add Photo
              </Btn>
              <Btn variant="subtle" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
          No photos yet. Add your first one above.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
            gap: 10,
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 120,
                  overflow: "hidden",
                  background: "hsl(var(--background))",
                }}
              >
                <img
                  src={item.imageUrl}
                  alt={item.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 2,
                    marginBottom: 8,
                  }}
                >
                  {item.category}
                  {item.desc && ` · ${item.desc}`}
                </div>
                <Btn variant="danger" size="sm" onClick={() => del(item)}>
                  Delete
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── News Manager ──────────────────────────────────────────────────────────────
function NewsManager({ toast }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showDrafts, setShowDrafts] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blank = {
    title: "",
    type: "News",
    date: "",
    desc: "",
    registrationLink: "",
    registrationCutoff: "",
    paymentLink: "",
    imageUrl: "",
    status: "published",
  };
  const [form, setForm] = useState(blank);
  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const isEvent = form.type === "Event";

  // Track whether form has unsaved changes
  const isDirty =
    form.title !== blank.title ||
    form.date !== blank.date ||
    form.desc !== blank.desc ||
    form.imageUrl !== blank.imageUrl;

  const load = async () => {
    setLoading(true);
    const all = await fetchCollection("admin_news");
    setItems(all.filter((i: any) => i.status !== "draft"));
    setDrafts(all.filter((i: any) => i.status === "draft"));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ── Cancel with confirmation if form has changes ──────────────────────────
  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Are you sure you want to discard them?",
      );
      if (!confirmed) return;
    }
    setShowForm(false);
    setEditingItem(null);
    setForm(blank);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Image must be under 5MB", "error");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const storage = getStorage();
      const fileName = `news/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const sRef = storageRef(storage, fileName);
      const uploadTask = uploadBytesResumable(sRef, file);
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          setUploadProgress(
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          );
        },
        () => {
          toast("Upload failed", "error");
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setForm((p) => ({ ...p, imageUrl: url }));
          toast("Image uploaded ✓", "success");
          setUploading(false);
          setUploadProgress(0);
        },
      );
    } catch {
      toast("Upload error", "error");
      setUploading(false);
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.title || !form.date)
      return toast("Fill in Title and Date", "error");
    const payload = { ...form, status: "published", createdAt: Date.now() };
    if (editingItem) {
      await updateInCollection("admin_news", editingItem.id, payload);
      toast("Updated ✓", "success");
    } else {
      await addToCollection("admin_news", payload);
      toast("Published ✓", "success");
    }
    setShowForm(false);
    setEditingItem(null);
    setForm(blank);
    load();
  };

  // ── Save as Draft ─────────────────────────────────────────────────────────
  const saveDraft = async () => {
    if (!form.title) return toast("Add a title before saving draft", "error");
    const payload = { ...form, status: "draft", createdAt: Date.now() };
    if (editingItem) {
      await updateInCollection("admin_news", editingItem.id, payload);
      toast("Draft updated ✓", "success");
    } else {
      await addToCollection("admin_news", payload);
      toast("Saved as draft ✓", "success");
    }
    setShowForm(false);
    setEditingItem(null);
    setForm(blank);
    load();
  };

  // ── Publish a draft ───────────────────────────────────────────────────────
  const publishDraft = async (item: any) => {
    await updateInCollection("admin_news", item.id, {
      ...item,
      status: "published",
    });
    toast("Published ✓", "success");
    load();
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      title: item.title || "",
      type: item.type || "News",
      date: item.date || "",
      desc: item.desc || "",
      registrationLink: item.registrationLink || "",
      registrationCutoff: item.registrationCutoff || "",
      paymentLink: item.paymentLink || "",
      imageUrl: item.imageUrl || "",
      status: item.status || "published",
    });
    setShowForm(true);
    setShowDrafts(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const del = async (id: string) => {
    if (!confirm("Delete this post permanently?")) return;
    await deleteFromCollection("admin_news", id);
    toast("Deleted", "info");
    load();
  };

  const renderItem = (item: any, isDraft = false) => (
    <div
      key={item.id}
      style={{
        background: "hsl(var(--secondary))",
        border: `1px solid ${isDraft ? "hsl(38 92% 44% / 0.4)" : "hsl(var(--border))"}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title}
            style={{
              width: 56,
              height: 40,
              objectFit: "cover",
              borderRadius: 6,
              flexShrink: 0,
            }}
          />
        )}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 20,
                background:
                  item.type === "Event"
                    ? "hsl(20 100% 50% / 0.15)"
                    : "hsl(var(--secondary))",
                color:
                  item.type === "Event"
                    ? "hsl(20 100% 50%)"
                    : "hsl(var(--muted-foreground))",
                border: "1px solid hsl(var(--border))",
              }}
            >
              {item.type}
            </span>
            {isDraft && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "hsl(38 92% 44% / 0.12)",
                  color: "hsl(38 92% 44%)",
                  border: "1px solid hsl(38 92% 44% / 0.3)",
                }}
              >
                ✏️ Draft
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              marginTop: 3,
            }}
          >
            {item.date}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isDraft && (
          <Btn variant="primary" size="sm" onClick={() => publishDraft(item)}>
            🚀 Publish
          </Btn>
        )}
        <Btn variant="subtle" size="sm" onClick={() => startEdit(item)}>
          ✏️ Edit
        </Btn>
        <Btn variant="danger" size="sm" onClick={() => del(item.id)}>
          Delete
        </Btn>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          News & Events ({items.length})
          {drafts.length > 0 && (
            <button
              onClick={() => setShowDrafts((v) => !v)}
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 10px",
                borderRadius: 20,
                background: "hsl(38 92% 44% / 0.12)",
                color: "hsl(38 92% 44%)",
                border: "1px solid hsl(38 92% 44% / 0.3)",
                cursor: "pointer",
              }}
            >
              ✏️ {drafts.length} Draft{drafts.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={() => {
            if (showForm) {
              handleCancel();
            } else {
              setEditingItem(null);
              setForm(blank);
              setShowForm(true);
            }
          }}
        >
          {showForm ? "✕ Cancel" : "+ Add Post"}
        </Btn>
      </div>

      {/* Drafts section */}
      <AnimatePresence>
        {showDrafts && drafts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              marginBottom: 20,
              padding: "14px 16px",
              background: "hsl(38 92% 44% / 0.05)",
              border: "1px solid hsl(38 92% 44% / 0.25)",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 12,
                color: "hsl(38 92% 44%)",
                marginBottom: 10,
              }}
            >
              ✏️ Saved Drafts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drafts.map((item) => renderItem(item, true))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 16,
                color: "hsl(var(--foreground))",
              }}
            >
              {editingItem
                ? editingItem.status === "draft"
                  ? "✏️ Edit Draft"
                  : "✏️ Edit Post"
                : "➕ New Post"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Title *</label>
                <input
                  style={inp}
                  placeholder="e.g. 30-Day Challenge"
                  value={form.title}
                  onChange={f("title")}
                />
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select style={inp} value={form.type} onChange={f("type")}>
                  {NEWS_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={form.date}
                  onChange={f("date")}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Description</label>
              <textarea
                style={{ ...inp, minHeight: 80, resize: "vertical" }}
                placeholder="Describe the news or event…"
                value={form.desc}
                onChange={f("desc")}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Image (optional)</label>
              {form.imageUrl ? (
                <div style={{ position: "relative", width: "fit-content" }}>
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    style={{
                      width: 220,
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                  <button
                    onClick={() => setForm((p) => ({ ...p, imageUrl: "" }))}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px dashed hsl(var(--border))",
                      background: "hsl(var(--card))",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {uploading
                      ? `Uploading… ${uploadProgress}%`
                      : "📁 Upload image (max 5MB)"}
                  </button>
                  {uploading && (
                    <div
                      style={{
                        marginTop: 8,
                        height: 4,
                        background: "hsl(var(--border))",
                        borderRadius: 2,
                        overflow: "hidden",
                        width: 200,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${uploadProgress}%`,
                          background: "hsl(20 100% 50%)",
                          borderRadius: 2,
                          transition: "width 0.2s",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {isEvent && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "14px 16px",
                  background: "hsl(var(--background))",
                  borderRadius: 10,
                  border: "1px solid hsl(20 100% 50% / 0.3)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: "hsl(20 100% 50%)",
                    marginBottom: 12,
                  }}
                >
                  🎟 Event Details
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                    gap: 12,
                  }}
                >
                  <div>
                    <label style={lbl}>Registration Link</label>
                    <input
                      style={inp}
                      placeholder="https://forms.gle/..."
                      value={form.registrationLink}
                      onChange={f("registrationLink")}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Registration Cutoff</label>
                    <input
                      style={inp}
                      type="date"
                      value={form.registrationCutoff}
                      onChange={f("registrationCutoff")}
                    />
                  </div>
                  <div>
                    <label style={lbl}>Payment Link</label>
                    <input
                      style={inp}
                      placeholder="https://payfast.io/..."
                      value={form.paymentLink}
                      onChange={f("paymentLink")}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn variant="primary" onClick={save} disabled={uploading}>
                🚀 {editingItem?.status === "draft" ? "Publish Now" : "Publish"}
              </Btn>
              <Btn variant="subtle" onClick={saveDraft} disabled={uploading}>
                💾 Save as Draft
              </Btn>
              <Btn variant="ghost" onClick={handleCancel}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Published posts list */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No published posts yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => renderItem(item, false))}
        </div>
      )}
    </div>
  );
}

// ── Members Manager ───────────────────────────────────────────────────────────
function MembersManager({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  // ── Tier config ─────────────────────────────────────────────────────────────
  const TIER_CONFIG: Record<
    string,
    { color: string; label: string; group: string }
  > = {
    // Under 18
    u18: { color: "hsl(263 85% 58%)", label: "Under 18", group: "u18" },
    // Hybrid
    hybrid_12m: {
      color: "hsl(217 91% 53%)",
      label: "Hybrid 12-month",
      group: "hybrid",
    },
    hybrid_6m: {
      color: "hsl(217 91% 53%)",
      label: "Hybrid 6-month",
      group: "hybrid",
    },
    hybrid_m2m: {
      color: "hsl(217 91% 53%)",
      label: "Hybrid M-to-M",
      group: "hybrid",
    },
    // Unlimited
    unlimited_12m: {
      color: "hsl(20 100% 50%)",
      label: "Unlimited 12-month",
      group: "unlimited",
    },
    unlimited_6m: {
      color: "hsl(20 100% 50%)",
      label: "Unlimited 6-month",
      group: "unlimited",
    },
    unlimited_m2m: {
      color: "hsl(20 100% 50%)",
      label: "Unlimited M-to-M",
      group: "unlimited",
    },
    // Legacy fallbacks — safe to keep so old data doesn't break
    basic: {
      color: "hsl(var(--muted-foreground))",
      label: "Basic (legacy)",
      group: "legacy",
    },
    silver: { color: "#e2e8f0", label: "Silver (legacy)", group: "legacy" },
    gold: { color: "hsl(38 92% 50%)", label: "Gold (legacy)", group: "legacy" },
  };

  const getTierCfg = (tier: string | null) =>
    tier
      ? (TIER_CONFIG[tier] ?? TIER_CONFIG.basic)
      : {
          color: "hsl(var(--muted-foreground))",
          label: "Not yet assigned",
          group: "unassigned",
        };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([uid, val]: [string, any]) => ({
            uid,
            ...val,
            // No fallback to "basic" — that's an app subscription tier, not
            // a gym contract. An unset membership genuinely means "no
            // contract on file yet," and should stay unset until an admin
            // assigns one below.
            membership: val.membership ?? null,
          }),
        );
        setMembers(
          list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        );
      }
    } catch {
      toast("Failed to load members", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const setTier = async (uid: string, tier: string) => {
    setSaving(uid);
    try {
      await set(ref(db, `mk2_users/${uid}/membership`), tier);
      setMembers((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, membership: tier } : m)),
      );
      toast(`Tier updated to ${getTierCfg(tier).label} ✓`, "success");
    } catch {
      toast("Update failed", "error");
    }
    setSaving(null);
  };

  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Group counts for summary pills ─────────────────────────────────────────
  const groupCounts = {
    u18: members.filter((m) => m.membership === "u18").length,
    hybrid: members.filter((m) => (m.membership ?? "").startsWith("hybrid"))
      .length,
    unlimited: members.filter((m) =>
      (m.membership ?? "").startsWith("unlimited"),
    ).length,
    unassigned: members.filter((m) => !m.membership).length,
    legacy: members.filter((m) =>
      ["basic", "silver", "gold"].includes(m.membership ?? ""),
    ).length,
  };

  const GROUP_PILLS = [
    { key: "u18", label: "Under 18", color: "hsl(263 85% 58%)" },
    { key: "hybrid", label: "Hybrid", color: "hsl(217 91% 53%)" },
    { key: "unlimited", label: "Unlimited", color: "hsl(20 100% 50%)" },
    {
      key: "unassigned",
      label: "Not Assigned",
      color: "hsl(var(--muted-foreground))",
    },
    { key: "legacy", label: "Legacy", color: "hsl(38 92% 44%)" },
  ];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          👥 App Users ({members.length})
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...inp, width: 200 }}
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Btn variant="subtle" size="sm" onClick={loadMembers}>
            ↻ Refresh
          </Btn>
        </div>
      </div>

      {/* Group summary pills */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        <div
          style={{
            background: "hsl(var(--secondary))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
            color: "hsl(var(--muted-foreground))",
          }}
        >
          Total: {members.length}
        </div>
        {GROUP_PILLS.map((g) => (
          <div
            key={g.key}
            style={{
              background: `${g.color}15`,
              border: `1px solid ${g.color}40`,
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              color: g.color,
            }}
          >
            {g.label}: {groupCounts[g.key as keyof typeof groupCounts]}
          </div>
        ))}
      </div>

      {/* Member list */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading members…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No members found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m) => {
            const cfg = getTierCfg(m.membership ?? "basic");
            return (
              <div
                key={m.uid}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {m.name || "Unnamed"}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: `${cfg.color}20`,
                        color: cfg.color,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {m.email} · {m.points ?? 0} pts ·{" "}
                    {Array.isArray(m.checkIns) ? m.checkIns.length : 0}{" "}
                    check-ins · 🎟 {m.classCredits ?? 0} credits
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={m.membership ?? "basic"}
                    onChange={(e) => setTier(m.uid, e.target.value || null)}
                    disabled={saving === m.uid}
                    style={{
                      ...inp,
                      width: "auto",
                      padding: "6px 10px",
                      fontSize: 12,
                      borderColor: cfg.color,
                      color: cfg.color,
                    }}
                  >
                    <option value="">— Not assigned —</option>
                    {/* Active tiers */}
                    <optgroup label="Under 18">
                      <option value="u18">Under 18</option>
                    </optgroup>
                    <optgroup label="Hybrid">
                      <option value="hybrid_12m">Hybrid — 12 month</option>
                      <option value="hybrid_6m">Hybrid — 6 month</option>
                      <option value="hybrid_m2m">
                        Hybrid — Month to month
                      </option>
                    </optgroup>
                    <optgroup label="Unlimited">
                      <option value="unlimited_12m">
                        Unlimited — 12 month
                      </option>
                      <option value="unlimited_6m">Unlimited — 6 month</option>
                      <option value="unlimited_m2m">
                        Unlimited — Month to month
                      </option>
                    </optgroup>
                    {/* Legacy fallback — only shown if member currently has it */}
                    {["basic", "silver", "gold"].includes(
                      m.membership ?? "basic",
                    ) && (
                      <optgroup label="Legacy">
                        <option value="basic">Basic (legacy)</option>
                        <option value="silver">Silver (legacy)</option>
                        <option value="gold">Gold (legacy)</option>
                      </optgroup>
                    )}
                  </select>
                  {saving === m.uid && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      Saving…
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────
// Requires typing the member's name to confirm — too destructive for a
// plain window.confirm(). Only cleans up Realtime Database records; the
// Firebase Auth login itself is NOT deleted here (see warning in UI) —
// that requires a Cloud Function using the Admin SDK
// (admin.auth().deleteUser(uid)), which cannot run from client code.
function DeleteAccountModal({
  member,
  onClose,
  onDeleted,
  toast,
}: {
  member: any;
  onClose: () => void;
  onDeleted: (uid: string) => void;
  toast: any;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirmText.trim() === member.name;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      // 1. Remove the member's profile record.
      await remove(ref(db, `mk2_users/${member.uid}`));

      // 2. Remove their notification inbox.
      await remove(ref(db, `users/${member.uid}/notifications`));

      // 3. Scan class_bookings/* and class_waitlist/* and remove any entry
      //    keyed by this uid. These are nested under booking keys we don't
      //    know in advance, so we have to read the parent node and filter.
      const [bookingsSnap, waitlistSnap] = await Promise.all([
        get(ref(db, "class_bookings")),
        get(ref(db, "class_waitlist")),
      ]);

      const cleanupPromises: Promise<any>[] = [];

      if (bookingsSnap.exists()) {
        Object.entries(bookingsSnap.val()).forEach(
          ([bookingKey, entries]: [string, any]) => {
            if (entries && entries[member.uid] !== undefined) {
              cleanupPromises.push(
                remove(ref(db, `class_bookings/${bookingKey}/${member.uid}`)),
              );
            }
          },
        );
      }

      if (waitlistSnap.exists()) {
        Object.entries(waitlistSnap.val()).forEach(
          ([bookingKey, entries]: [string, any]) => {
            if (entries && entries[member.uid] !== undefined) {
              cleanupPromises.push(
                remove(ref(db, `class_waitlist/${bookingKey}/${member.uid}`)),
              );
            }
          },
        );
      }

      await Promise.all(cleanupPromises);

      toast(
        `${member.name}'s data deleted ✓ — their login still exists until removed via Cloud Function`,
        "info",
      );
      onDeleted(member.uid);
      onClose();
    } catch {
      toast("Delete failed — try again", "error");
    }
    setDeleting(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "hsl(var(--card))",
          border: "1px solid hsl(0 84% 51% / 0.4)",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            color: "hsl(0 84% 51%)",
            marginBottom: 4,
          }}
        >
          ⚠ Delete Account Data
        </div>
        <div
          style={{
            fontSize: 13,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          This permanently removes <strong>{member.name}</strong>'s profile,
          credits, points, check-ins, rewards, bookings and notifications from
          the database. This cannot be undone.
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "hsl(38 92% 44% / 0.08)",
            border: "1px solid hsl(38 92% 44% / 0.25)",
            fontSize: 12,
            color: "hsl(38 92% 44%)",
            lineHeight: 1.6,
          }}
        >
          ⚠ <strong>Their login is NOT deleted by this action.</strong> This
          only removes database records. To fully delete the account (Firebase
          Auth login), a developer needs to run a Cloud Function — this can't be
          done from the admin panel directly.
        </div>

        <label style={lbl}>Type "{member.name}" to confirm</label>
        <input
          style={{ ...inp, marginBottom: 18 }}
          placeholder={member.name}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoFocus
        />

        <div style={{ display: "flex", gap: 10 }}>
          <Btn
            variant="danger"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? "Deleting…" : "🗑 Delete Account Data"}
          </Btn>
          <Btn variant="subtle" onClick={onClose} disabled={deleting}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── App Members Manager (app subscription tier: basic/silver/gold) ───────────
// Distinct from MembersManager — that page manages `membership`, the gym
// CONTRACT tier (u18 / hybrid_* / unlimited_*) used for class booking rules.
// This page manages `appMembership`, the APP SUBSCRIPTION tier (basic /
// silver / gold) used for push notifications, community chat, AI credits,
// and PayFast billing — see Membership.tsx.
function AppMembersManager({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [migrated, setMigrated] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const APP_TIER_CONFIG: Record<string, { color: string; label: string }> = {
    basic: { color: "hsl(var(--muted-foreground))", label: "Basic (Free)" },
    silver: { color: "#cbd5e1", label: "Silver" },
    gold: { color: "hsl(38 92% 50%)", label: "Gold" },
  };
  const getTierCfg = (tier: string) =>
    APP_TIER_CONFIG[tier] ?? APP_TIER_CONFIG.basic;

  const loadMembers = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const raw = snap.val();
      const LEGACY_APP_TIERS = ["basic", "silver", "gold"];
      const migrations: Array<{ uid: string; value: string }> = [];

      const list = Object.entries(raw).map(([uid, val]: [string, any]) => {
        let appMembership = val.appMembership;
        if (!appMembership && LEGACY_APP_TIERS.includes(val.membership)) {
          appMembership = val.membership;
          migrations.push({ uid, value: appMembership });
        }
        return {
          uid,
          name: val.name || "Unnamed",
          email: val.email || "",
          appMembership: appMembership ?? "basic",
          aiTotal: val.aiQuota?.total ?? 0,
          aiRemaining: val.aiQuota?.remaining ?? 0,
          createdAt: val.createdAt ?? 0,
        };
      });

      if (migrations.length > 0 && !migrated) {
        await Promise.all(
          migrations.map((m) =>
            set(ref(db, `mk2_users/${m.uid}/appMembership`), m.value),
          ),
        );
        toast(
          `Migrated ${migrations.length} member${migrations.length !== 1 ? "s" : ""} to the new App Membership field ✓`,
          "info",
        );
        setMigrated(true);
      }

      setMembers(list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    } catch {
      toast("Failed to load app members", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const setTier = async (uid: string, tier: string) => {
    setSaving(uid);
    try {
      await set(ref(db, `mk2_users/${uid}/appMembership`), tier);
      setMembers((prev) =>
        prev.map((m) => (m.uid === uid ? { ...m, appMembership: tier } : m)),
      );
      toast(`App tier updated to ${getTierCfg(tier).label} ✓`, "success");
    } catch {
      toast("Update failed", "error");
    }
    setSaving(null);
  };

  const handleDeleted = (uid: string) => {
    setMembers((prev) => prev.filter((m) => m.uid !== uid));
  };

  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const groupCounts = {
    basic: members.filter((m) => m.appMembership === "basic").length,
    silver: members.filter((m) => m.appMembership === "silver").length,
    gold: members.filter((m) => m.appMembership === "gold").length,
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          📱 App Members ({members.length})
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            style={{ ...inp, width: 200 }}
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Btn variant="subtle" size="sm" onClick={loadMembers}>
            ↻ Refresh
          </Btn>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 16,
        }}
      >
        App subscription tier (Basic / Silver / Gold) — controls push
        notifications, community chat, AI credits and PayFast billing. This is
        separate from the member's gym contract tier under{" "}
        <strong style={{ color: "hsl(20 100% 50%)" }}>Membership Tiers</strong>.
      </div>

      {/* Group summary pills */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        <div
          style={{
            background: "hsl(var(--secondary))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
            color: "hsl(var(--muted-foreground))",
          }}
        >
          Total: {members.length}
        </div>
        {(["basic", "silver", "gold"] as const).map((tierId) => {
          const cfg = getTierCfg(tierId);
          return (
            <div
              key={tierId}
              style={{
                background: `${cfg.color}15`,
                border: `1px solid ${cfg.color}40`,
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: cfg.color,
              }}
            >
              {cfg.label}: {groupCounts[tierId]}
            </div>
          );
        })}
      </div>

      {/* Member list */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading members…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No members found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m) => {
            const cfg = getTierCfg(m.appMembership);
            return (
              <div
                key={m.uid}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  borderLeft: `3px solid ${cfg.color}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {m.name || "Unnamed"}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: `${cfg.color}20`,
                        color: cfg.color,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {m.email}
                    {m.appMembership !== "basic" &&
                      ` · 🤖 ${m.aiRemaining}/${m.aiTotal} AI credits`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select
                    value={m.appMembership ?? "basic"}
                    onChange={(e) => setTier(m.uid, e.target.value)}
                    disabled={saving === m.uid}
                    style={{
                      ...inp,
                      width: "auto",
                      padding: "6px 10px",
                      fontSize: 12,
                      borderColor: cfg.color,
                      color: cfg.color,
                    }}
                  >
                    <option value="basic">Basic (Free)</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                  </select>
                  {saving === m.uid && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      Saving…
                    </span>
                  )}
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget(m)}
                  >
                    🗑 Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteAccountModal
          member={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── Packages Manager ──────────────────────────────────────────────────────────
function PackagesManager({ toast }: any) {
  const [packages, setPackages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [assignUid, setAssignUid] = useState("");
  const [assignCredits, setAssignCredits] = useState("10");
  const [assignNote, setAssignNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const blank = {
    name: "",
    description: "",
    credits: "10",
    price: "299",
    badge: "",
    active: true,
  };
  const [form, setForm] = useState(blank);
  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const loadPackages = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "packages"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([id, val]: [string, any]) => ({ id, ...val }),
        );
        setPackages(list.sort((a: any, b: any) => a.price - b.price));
      } else setPackages([]);
    } catch {
      toast("Failed to load packages", "error");
    }
    setLoading(false);
  };

  const loadMembers = async () => {
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([uid, val]: [string, any]) => ({
            uid,
            name: val.name || "Unnamed",
            email: val.email || "",
            classCredits: val.classCredits ?? 0,
          }),
        );
        setMembers(list.sort((a: any, b: any) => a.name.localeCompare(b.name)));
      }
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    loadPackages();
    loadMembers();
  }, []);

  const save = async () => {
    if (!form.name || !form.credits || !form.price)
      return toast("Fill in Name, Credits and Price", "error");
    const data = {
      name: form.name,
      description: form.description,
      credits: parseInt(form.credits),
      price: parseInt(form.price),
      badge: form.badge,
      active: form.active,
      updatedAt: Date.now(),
    };
    try {
      if (editing) {
        await set(ref(db, `packages/${editing.id}`), data);
        toast("Updated ✓", "success");
      } else {
        await push(ref(db, "packages"), { ...data, createdAt: Date.now() });
        toast("Package created ✓", "success");
      }
      setShowForm(false);
      setEditing(null);
      setForm(blank);
      loadPackages();
    } catch {
      toast("Save failed", "error");
    }
  };

  const toggleActive = async (pkg: any) => {
    await set(ref(db, `packages/${pkg.id}/active`), !pkg.active);
    toast(pkg.active ? "Package hidden" : "Package visible ✓", "info");
    loadPackages();
  };

  const del = async (pkg: any) => {
    if (!confirm(`Delete "${pkg.name}"?`)) return;
    await remove(ref(db, `packages/${pkg.id}`));
    toast("Deleted", "info");
    loadPackages();
  };

  const startEdit = (pkg: any) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      description: pkg.description || "",
      credits: String(pkg.credits),
      price: String(pkg.price),
      badge: pkg.badge || "",
      active: pkg.active !== false,
    });
    setShowForm(true);
  };

  const assignCreditsToUser = async () => {
    if (!assignUid) return toast("Select a member", "error");
    const amount = parseInt(assignCredits);
    if (!amount || amount < 1)
      return toast("Enter valid credit amount", "error");
    setAssigning(true);
    try {
      const memberRef = ref(db, `mk2_users/${assignUid}/classCredits`);
      const snap = await get(memberRef);
      const current = snap.exists() ? (snap.val() as number) : 0;
      await set(memberRef, current + amount);
      await push(ref(db, `mk2_users/${assignUid}/creditHistory`), {
        amount,
        type: "manual_assign",
        note: assignNote || "Admin assignment",
        timestamp: Date.now(),
        adminAssigned: true,
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.uid === assignUid ? { ...m, classCredits: current + amount } : m,
        ),
      );
      toast(`+${amount} credits assigned ✓`, "success");
      setAssignNote("");
    } catch {
      toast("Assignment failed", "error");
    }
    setAssigning(false);
  };

  const selectedMember = members.find((m) => m.uid === assignUid);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Class Credit Packages ({packages.length})
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
            setForm(blank);
          }}
        >
          {showForm ? "✕ Cancel" : "+ New Package"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              {editing ? "Edit Package" : "New Package"}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Package Name</label>
                <input
                  style={inp}
                  placeholder="e.g. 10-Class Pack"
                  value={form.name}
                  onChange={f("name")}
                />
              </div>
              <div>
                <label style={lbl}>Credits</label>
                <input
                  style={inp}
                  type="number"
                  placeholder="10"
                  value={form.credits}
                  onChange={f("credits")}
                />
              </div>
              <div>
                <label style={lbl}>Price (ZAR)</label>
                <input
                  style={inp}
                  type="number"
                  placeholder="299"
                  value={form.price}
                  onChange={f("price")}
                />
              </div>
              <div>
                <label style={lbl}>Badge (optional)</label>
                <input
                  style={inp}
                  placeholder="Best Value"
                  value={form.badge}
                  onChange={f("badge")}
                />
              </div>
              <div>
                <label style={lbl}>Visible?</label>
                <select
                  style={inp}
                  value={form.active ? "true" : "false"}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      active: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">✓ Visible</option>
                  <option value="false">✕ Hidden</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Description</label>
              <input
                style={inp}
                placeholder="e.g. Perfect for regular gym-goers"
                value={form.description}
                onChange={f("description")}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="primary" onClick={save}>
                {editing ? "Save Changes" : "Create Package"}
              </Btn>
              <Btn
                variant="subtle"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : packages.length === 0 ? (
        <div
          style={{
            color: "hsl(var(--muted-foreground))",
            fontSize: 13,
            padding: "20px 0",
          }}
        >
          No packages yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
            gap: 12,
            marginBottom: 32,
          }}
        >
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                padding: 16,
                opacity: pkg.active ? 1 : 0.6,
              }}
            >
              {pkg.badge && (
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 10px",
                    borderRadius: 20,
                    background: "hsl(20 100% 50% / 0.15)",
                    color: "hsl(20 100% 50%)",
                    border: "1px solid hsl(20 100% 50% / 0.3)",
                    marginBottom: 10,
                  }}
                >
                  {pkg.badge}
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                {pkg.name}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 10,
                }}
              >
                {pkg.description}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    color: "hsl(20 100% 50%)",
                  }}
                >
                  {pkg.credits}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  credits
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>
                R{pkg.price}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn variant="subtle" size="sm" onClick={() => startEdit(pkg)}>
                  Edit
                </Btn>
                <Btn
                  variant={pkg.active ? "subtle" : "green"}
                  size="sm"
                  onClick={() => toggleActive(pkg)}
                >
                  {pkg.active ? "Hide" : "Show"}
                </Btn>
                <Btn variant="danger" size="sm" onClick={() => del(pkg)}>
                  Delete
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          borderTop: "1px solid hsl(var(--border))",
          paddingTop: 24,
          marginTop: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
          Manually Assign Credits
        </div>
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 16,
          }}
        >
          Assign credits when a member pays cash or EFT.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <label style={lbl}>Member</label>
            <select
              style={inp}
              value={assignUid}
              onChange={(e) => setAssignUid(e.target.value)}
            >
              <option value="">— Select member —</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} ({m.email}) — {m.classCredits} credits
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Credits to Add</label>
            <input
              style={inp}
              type="number"
              min="1"
              max="100"
              value={assignCredits}
              onChange={(e) => setAssignCredits(e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>Note (optional)</label>
            <input
              style={inp}
              placeholder="e.g. Cash payment - 10-pack"
              value={assignNote}
              onChange={(e) => setAssignNote(e.target.value)}
            />
          </div>
        </div>
        {selectedMember && (
          <div
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              marginBottom: 12,
              padding: "8px 12px",
              background: "hsl(var(--secondary))",
              borderRadius: 8,
            }}
          >
            {selectedMember.name} has{" "}
            <strong style={{ color: "hsl(20 100% 50%)" }}>
              {selectedMember.classCredits}
            </strong>{" "}
            credits → after:{" "}
            <strong style={{ color: "hsl(142 72% 37%)" }}>
              {selectedMember.classCredits + parseInt(assignCredits || "0")}
            </strong>
          </div>
        )}
        <Btn
          variant="green"
          onClick={assignCreditsToUser}
          disabled={assigning || !assignUid}
        >
          {assigning ? "Assigning…" : `✓ Assign ${assignCredits} Credits`}
        </Btn>
      </div>
    </div>
  );
}

// =============================================================================
//  PendingPaymentsManager
// =============================================================================
function PendingPaymentsManager({ toast }: any) {
  const [pending, setPending] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "stuck">("all");

  // A booking is "stuck" if it's been pending for more than 15 minutes
  // (your cleanup function should have fired, but sometimes it doesn't)
  const STUCK_THRESHOLD = 15 * 60 * 1000;

  const load = async () => {
    setLoading(true);
    try {
      // Load all mk2_bookings and filter for pending_payment
      const [bookSnap, membersSnap] = await Promise.all([
        get(ref(db, "mk2_bookings")),
        get(ref(db, "mk2_users")),
      ]);

      const membersMap: Record<string, any> = {};
      if (membersSnap.exists()) {
        Object.entries(membersSnap.val()).forEach(([uid, v]: [string, any]) => {
          membersMap[uid] = v;
        });
      }
      setMembers(membersMap);

      if (!bookSnap.exists()) {
        setPending([]);
        setLoading(false);
        return;
      }

      const list: any[] = [];
      Object.entries(bookSnap.val()).forEach(([key, v]: [string, any]) => {
        if (v.status === "pending_payment") {
          list.push({ key, ...v });
        }
      });

      // Sort newest first
      list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setPending(list);
    } catch {
      toast("Failed to load pending payments", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ── Manually release a stuck pending booking ───────────────────────────────
  const releaseBooking = async (item: any) => {
    if (
      !confirm(
        `Release stuck booking for ${members[item.userId]?.name ?? "this member"} on ${item.className} ${item.dateKey}? This will free up the spot.`,
      )
    )
      return;
    setReleasing(item.key);
    try {
      // Remove from mk2_bookings
      await remove(ref(db, `mk2_bookings/${item.key}`));

      // Also remove from class_bookings if it was written there
      const bk = `${item.className.replace(/\s+/g, "_").toUpperCase()}_${item.dateKey}`;
      const cbSnap = await get(ref(db, `class_bookings/${bk}/${item.userId}`));
      if (cbSnap.exists()) {
        await remove(ref(db, `class_bookings/${bk}/${item.userId}`));
      }

      // Notify the member
      await Promise.resolve(
        push(ref(db, `users/${item.userId}/notifications`), {
          title: "Booking Released",
          body: `Your pending booking for ${item.className} on ${item.dateDisplay ?? item.dateKey} was released. Please try booking again.`,
          type: "class_cancelled",
          read: false,
          createdAt: Date.now(),
        }),
      );

      toast("Booking released ✓ — member notified", "success");
      setPending((prev) => prev.filter((p) => p.key !== item.key));
    } catch {
      toast("Release failed — try again", "error");
    }
    setReleasing(null);
  };

  const stuckCount = pending.filter(
    (p) => Date.now() - (p.createdAt ?? 0) > STUCK_THRESHOLD,
  ).length;

  const filtered =
    filter === "stuck"
      ? pending.filter((p) => Date.now() - (p.createdAt ?? 0) > STUCK_THRESHOLD)
      : pending;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Pending Payments
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Non-members who started checkout but haven't completed payment. Spots
        are reserved for 15 minutes then auto-released.
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total pending", val: pending.length, accent: false },
          { label: "Stuck (>15 min)", val: stuckCount, accent: stuckCount > 0 },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "hsl(var(--secondary))",
              border: `1px solid ${s.accent ? "hsl(0 84% 51% / 0.4)" : "hsl(var(--border))"}`,
              borderRadius: 12,
              padding: "14px 18px",
              borderLeft: s.accent ? "3px solid hsl(0 84% 51%)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: s.accent ? "hsl(0 84% 51%)" : "hsl(var(--foreground))",
                lineHeight: 1,
              }}
            >
              {loading ? "—" : s.val}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Info box */}
      <div
        style={{
          marginBottom: 20,
          padding: "10px 14px",
          background: "hsl(217 91% 53% / 0.08)",
          border: "1px solid hsl(217 91% 53% / 0.2)",
          borderRadius: 8,
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          lineHeight: 1.7,
        }}
      >
        ℹ️ Your Firebase Function auto-releases spots after 15 minutes. Only
        manually release if a member reports being stuck or the function failed
        to fire.
      </div>

      {/* Filter + refresh */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(["all", "stuck"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              background:
                filter === f ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
              color: filter === f ? "#000" : "hsl(var(--foreground))",
              border: filter === f ? "none" : "1px solid hsl(var(--border))",
              fontFamily: "var(--font-body)",
            }}
          >
            {f === "all"
              ? `All (${pending.length})`
              : `⚠ Stuck (${stuckCount})`}
          </button>
        ))}
        <Btn variant="subtle" size="sm" onClick={load}>
          ↻ Refresh
        </Btn>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            color: "hsl(var(--muted-foreground))",
            fontSize: 13,
            padding: "20px 0",
          }}
        >
          {filter === "stuck"
            ? "No stuck bookings — all clear ✓"
            : "No pending payments right now."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((item) => {
            const member = members[item.userId];
            const ageMs = Date.now() - (item.createdAt ?? 0);
            const isStuck = ageMs > STUCK_THRESHOLD;
            const minsLeft = Math.max(0, 15 - Math.floor(ageMs / 60000));

            return (
              <div
                key={item.key}
                style={{
                  background: "hsl(var(--secondary))",
                  border: `1px solid ${isStuck ? "hsl(0 84% 51% / 0.35)" : "hsl(var(--border))"}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  borderLeft: `3px solid ${isStuck ? "hsl(0 84% 51%)" : "hsl(38 92% 44%)"}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div>
                    {/* Member info */}
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 4,
                      }}
                    >
                      {member?.name ?? item.userId}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: isStuck
                            ? "hsl(0 84% 51% / 0.12)"
                            : "hsl(38 92% 44% / 0.12)",
                          color: isStuck ? "hsl(0 84% 51%)" : "hsl(38 92% 44%)",
                        }}
                      >
                        {isStuck ? "⚠ Stuck" : `⏳ ${minsLeft} min left`}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--muted-foreground))",
                        marginBottom: 2,
                      }}
                    >
                      {member?.email ?? "—"}
                    </div>

                    {/* Class info */}
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 16,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "hsl(var(--muted-foreground))",
                            marginBottom: 2,
                          }}
                        >
                          Class
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {item.className}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "hsl(var(--muted-foreground))",
                            marginBottom: 2,
                          }}
                        >
                          Date
                        </div>
                        <div style={{ fontSize: 13 }}>
                          {item.dateDisplay ?? item.dateKey}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "hsl(var(--muted-foreground))",
                            marginBottom: 2,
                          }}
                        >
                          Time
                        </div>
                        <div style={{ fontSize: 13 }}>{item.time ?? "—"}</div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "hsl(var(--muted-foreground))",
                            marginBottom: 2,
                          }}
                        >
                          Amount
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "hsl(20 100% 50%)",
                          }}
                        >
                          R{item.price ?? "—"}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "hsl(var(--muted-foreground))",
                            marginBottom: 2,
                          }}
                        >
                          Started
                        </div>
                        <div style={{ fontSize: 13 }}>
                          {timeAgo(item.createdAt ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    {isStuck && (
                      <Btn
                        variant="danger"
                        size="sm"
                        disabled={releasing === item.key}
                        onClick={() => releaseBooking(item)}
                      >
                        {releasing === item.key
                          ? "Releasing…"
                          : "🔓 Release Spot"}
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Manual Check-In Manager ───────────────────────────────────────────────────
// Adds: Backdate Check-In tab so staff can log historical visits for members.
function ManualCheckInManager({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState("");
  const [pointsBonus, setPointsBonus] = useState<string>("10");
  const [adjustingPoints, setAdjustingPoints] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recentCheckIns, setRecentCheckIns] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<"manual" | "backdate">("manual");

  // Backdate state
  const [bdUid, setBdUid] = useState("");
  const [bdDate, setBdDate] = useState("");
  const [bdTime, setBdTime] = useState("07:00");
  const [bdSubmitting, setBdSubmitting] = useState(false);
  const [bdPreview, setBdPreview] = useState<{
    alreadyExists: boolean;
    newTotal: number;
    milestone: boolean;
  } | null>(null);

  const today = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const selectedMember = members.find((m) => m.uid === selectedUid) ?? null;
  const alreadyCheckedIn =
    selectedMember?.checkIns?.some((ci: any) => {
      const dateStr = typeof ci === "object" && ci.date ? ci.date : null;
      return dateStr === today;
    }) ?? false;

  // ── Load members list once on mount ───────────────────────────────────────
  const loadMembers = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([uid, val]: [string, any]) => ({
            uid,
            name: val.name || "Unnamed",
            email: val.email || "",
            points: val.points ?? 0,
            checkIns: val.checkIns ?? [],
            classCredits: val.classCredits ?? 0,
          }),
        );
        setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      toast("Failed to load members", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, []);

  // ── Real-time listener for today's check-ins ──────────────────────────────
  // Updates instantly when any member checks in — no refresh button needed
  useEffect(() => {
    return onValue(ref(db, "mk2_users"), (snap) => {
      if (!snap.exists()) {
        setRecentCheckIns([]);
        return;
      }
      const list: any[] = [];
      Object.entries(snap.val()).forEach(([uid, val]: [string, any]) => {
        const checkIns = Array.isArray(val.checkIns) ? val.checkIns : [];
        const todayCheckIn = checkIns.find((ci: any) => ci?.date === today);
        if (todayCheckIn) {
          list.push({
            uid,
            name: val.name || "Unnamed",
            time: todayCheckIn.time || "—",
          });
        }
      });
      setRecentCheckIns(list.sort((a, b) => a.time.localeCompare(b.time)));
    });
  }, []);

  // ── Recompute backdate preview whenever member or date changes ─────────────
  useEffect(() => {
    if (!bdUid || !bdDate) {
      setBdPreview(null);
      return;
    }
    const member = members.find((m) => m.uid === bdUid);
    if (!member) {
      setBdPreview(null);
      return;
    }
    const [y, mo, d] = bdDate.split("-");
    const localeDateStr = `${d}/${mo}/${y}`;
    const checkIns: any[] = Array.isArray(member.checkIns)
      ? member.checkIns
      : [];
    const alreadyExists = checkIns.some(
      (ci: any) => ci?.date === localeDateStr,
    );
    const newTotal = alreadyExists ? checkIns.length : checkIns.length + 1;
    const oldMilestones = Math.floor(checkIns.length / 40);
    const newMilestones = Math.floor(newTotal / 40);
    setBdPreview({
      alreadyExists,
      newTotal,
      milestone: newMilestones > oldMilestones,
    });
  }, [bdUid, bdDate, members]);

  // ── Manual check-in ───────────────────────────────────────────────────────
  const handleManualCheckIn = async () => {
    if (!selectedUid) return toast("Select a member first", "error");
    if (alreadyCheckedIn)
      return toast(`${selectedMember?.name} already checked in today`, "error");

    setSubmitting(true);
    try {
      const memberSnap = await get(ref(db, `mk2_users/${selectedUid}`));
      if (!memberSnap.exists()) throw new Error("Member not found");
      const val = memberSnap.val();

      const checkIns = Array.isArray(val.checkIns) ? val.checkIns : [];
      const time = new Date().toLocaleTimeString("en-ZA", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const newCheckIns = [...checkIns, { date: today, time }];
      const bonus = parseInt(pointsBonus) || 10;
      const newPoints = (val.points ?? 0) + bonus;

      const newTotal = newCheckIns.length;
      const newMilestones = Math.floor(newTotal / 40);
      const oldMilestones = Math.floor(checkIns.length / 40);
      const milestoneReached = newMilestones > oldMilestones;

      await set(ref(db, `mk2_users/${selectedUid}/checkIns`), newCheckIns);
      await set(ref(db, `mk2_users/${selectedUid}/points`), newPoints);

      if (milestoneReached) {
        const code = `MK2R-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        const earnedAt = Date.now();
        const expiresAt = earnedAt + 60 * 24 * 60 * 60 * 1000;
        await push(ref(db, `mk2_users/${selectedUid}/rewards`), {
          status: "pending",
          earnedAt,
          expiresAt,
          redemptionCode: code,
          checkInMilestone: newMilestones * 40,
          type: null,
        });
        toast(
          `✓ ${selectedMember?.name} checked in! 🎉 Milestone reached — reward created`,
          "success",
        );
      } else {
        toast(
          `✓ ${selectedMember?.name} checked in at ${time} (+${bonus} pts)`,
          "success",
        );
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.uid === selectedUid
            ? { ...m, checkIns: newCheckIns, points: newPoints }
            : m,
        ),
      );
      setSelectedUid("");
      setPointsBonus("10");
      // No need to call loadRecentCheckIns — onValue listener updates automatically
    } catch {
      toast("Check-in failed — try again", "error");
    }
    setSubmitting(false);
  };

  // ── Adjust points ─────────────────────────────────────────────────────────
  const handleAdjustPoints = async () => {
    if (!selectedUid || !selectedMember) return;
    const delta = parseInt(pointsBonus);
    if (isNaN(delta)) return toast("Enter a valid points value", "error");

    setAdjustingPoints(true);
    try {
      const newPoints = selectedMember.points + delta;
      await set(ref(db, `mk2_users/${selectedUid}/points`), newPoints);
      setMembers((prev) =>
        prev.map((m) =>
          m.uid === selectedUid ? { ...m, points: newPoints } : m,
        ),
      );
      toast(
        `✓ ${selectedMember.name}: ${delta > 0 ? "+" : ""}${delta} pts → ${newPoints} total`,
        "success",
      );
      setPointsBonus("10");
      setSelectedUid("");
    } catch {
      toast("Points update failed", "error");
    }
    setAdjustingPoints(false);
  };

  // ── Backdate submit ───────────────────────────────────────────────────────
  const handleBackdate = async () => {
    if (!bdUid) return toast("Select a member", "error");
    if (!bdDate) return toast("Pick a date", "error");
    if (bdPreview?.alreadyExists)
      return toast("Member already has a check-in on that date", "error");

    const picked = new Date(bdDate + "T00:00:00");
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    if (picked > todayDate)
      return toast("Cannot backdate to a future date", "error");

    setBdSubmitting(true);
    try {
      const memberSnap = await get(ref(db, `mk2_users/${bdUid}`));
      if (!memberSnap.exists()) throw new Error("Member not found");
      const val = memberSnap.val();

      const checkIns: any[] = Array.isArray(val.checkIns) ? val.checkIns : [];

      const [y, mo, d] = bdDate.split("-");
      const localeDateStr = `${d}/${mo}/${y}`;

      if (checkIns.some((ci: any) => ci?.date === localeDateStr)) {
        toast("That date already exists for this member", "error");
        setBdSubmitting(false);
        return;
      }

      const newEntry = { date: localeDateStr, time: bdTime, backdated: true };
      const newCheckIns = [...checkIns, newEntry].sort((a, b) => {
        const parse = (s: string) => {
          const parts = s.split("/");
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        };
        return parse(a.date) - parse(b.date);
      });

      const newTotal = newCheckIns.length;
      const oldMilestones = Math.floor(checkIns.length / 40);
      const newMilestones = Math.floor(newTotal / 40);
      const milestoneReached = newMilestones > oldMilestones;
      const newPoints = (val.points ?? 0) + 10;

      await set(ref(db, `mk2_users/${bdUid}/checkIns`), newCheckIns);
      await set(ref(db, `mk2_users/${bdUid}/points`), newPoints);

      if (milestoneReached) {
        const code = `MK2R-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
        const earnedAt = Date.now();
        const expiresAt = earnedAt + 60 * 24 * 60 * 60 * 1000;
        await push(ref(db, `mk2_users/${bdUid}/rewards`), {
          status: "pending",
          earnedAt,
          expiresAt,
          redemptionCode: code,
          checkInMilestone: newMilestones * 40,
          type: null,
          note: `Backdated milestone — check-in logged for ${localeDateStr}`,
        });
        toast(
          `✓ Backdated to ${localeDateStr} — 🎉 milestone hit, reward created!`,
          "success",
        );
      } else {
        toast(
          `✓ Check-in backdated to ${localeDateStr} for ${members.find((m) => m.uid === bdUid)?.name} (${newTotal} total)`,
          "success",
        );
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.uid === bdUid
            ? { ...m, checkIns: newCheckIns, points: newPoints }
            : m,
        ),
      );
      setBdUid("");
      setBdDate("");
      setBdTime("07:00");
      setBdPreview(null);
    } catch {
      toast("Backdate failed — try again", "error");
    }
    setBdSubmitting(false);
  };

  const bdMember = members.find((m) => m.uid === bdUid) ?? null;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Manual Check-In
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Override for when members forget to check in via app, or backdate
        historical visits.
      </div>

      {/* Sub-tab switcher */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 20,
        }}
      >
        {[
          { id: "manual" as const, label: "✅ Check In Today" },
          { id: "backdate" as const, label: "📅 Backdate Check-In" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background: subTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color: subTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CHECK IN TODAY ── */}
      {subTab === "manual" && (
        <>
          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Select Member</label>
                {loading ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    Loading…
                  </div>
                ) : (
                  <select
                    style={inp}
                    value={selectedUid}
                    onChange={(e) => setSelectedUid(e.target.value)}
                  >
                    <option value="">— Choose member —</option>
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label style={lbl}>Points Bonus / Adjustment</label>
                <input
                  style={inp}
                  type="number"
                  value={pointsBonus}
                  onChange={(e) => setPointsBonus(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>

            {selectedMember && (
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 14,
                  padding: "8px 12px",
                  background: "hsl(var(--background))",
                  borderRadius: 8,
                }}
              >
                <strong style={{ color: "hsl(var(--foreground))" }}>
                  {selectedMember.name}
                </strong>{" "}
                — {selectedMember.checkIns.length} check-ins total ·{" "}
                {selectedMember.points} pts
                {alreadyCheckedIn && (
                  <span style={{ color: "hsl(38 92% 44%)", marginLeft: 8 }}>
                    ⚠ Already checked in today
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn
                variant="primary"
                onClick={handleManualCheckIn}
                disabled={submitting || !selectedUid || alreadyCheckedIn}
              >
                {submitting ? "Checking in…" : "✓ Check In"}
              </Btn>
              <Btn
                variant="subtle"
                onClick={handleAdjustPoints}
                disabled={adjustingPoints || !selectedUid}
              >
                {adjustingPoints ? "Updating…" : "± Adjust Points"}
              </Btn>
              <Btn variant="subtle" size="sm" onClick={loadMembers}>
                ↻ Refresh Members
              </Btn>
            </div>
          </div>

          {/* Today's check-ins — updates in real-time via onValue */}
          {recentCheckIns.length > 0 && (
            <div>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                Today's Check-Ins ({recentCheckIns.length})
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "hsl(142 72% 37% / 0.12)",
                    color: "hsl(142 72% 37%)",
                  }}
                >
                  ● Live
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {recentCheckIns.map((ci) => (
                  <div
                    key={ci.uid}
                    style={{
                      background: "hsl(var(--secondary))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      padding: "8px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {ci.name}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      {ci.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── BACKDATE TAB ── */}
      {subTab === "backdate" && (
        <div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "hsl(38 92% 44% / 0.08)",
              border: "1px solid hsl(38 92% 44% / 0.25)",
              fontSize: 12,
              color: "hsl(38 92% 44%)",
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            ⚠ Use this to log check-ins members completed before the app
            launched. Each backdated entry awards +10 pts and counts toward the
            40-check-in reward cycle. Duplicate dates are blocked automatically.
          </div>

          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Select Member *</label>
                {loading ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                    }}
                  >
                    Loading…
                  </div>
                ) : (
                  <select
                    style={inp}
                    value={bdUid}
                    onChange={(e) => setBdUid(e.target.value)}
                  >
                    <option value="">— Choose member —</option>
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.name} ({m.email}) — {m.checkIns.length} check-ins
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={lbl}>Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={bdDate}
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setBdDate(e.target.value)}
                />
              </div>

              <div>
                <label style={lbl}>Time (approx)</label>
                <select
                  style={inp}
                  value={bdTime}
                  onChange={(e) => setBdTime(e.target.value)}
                >
                  {[
                    "05:00",
                    "05:30",
                    "06:00",
                    "06:30",
                    "07:00",
                    "07:30",
                    "08:00",
                    "08:30",
                    "09:00",
                    "09:30",
                    "10:00",
                    "10:30",
                    "11:00",
                    "12:00",
                    "13:00",
                    "14:00",
                    "15:00",
                    "16:00",
                    "17:00",
                    "17:30",
                    "18:00",
                    "18:30",
                    "19:00",
                    "19:30",
                    "20:00",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live preview */}
            {bdPreview && bdMember && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: bdPreview.alreadyExists
                    ? "hsl(0 84% 51% / 0.08)"
                    : bdPreview.milestone
                      ? "hsl(142 72% 37% / 0.08)"
                      : "hsl(var(--background))",
                  border: `1px solid ${
                    bdPreview.alreadyExists
                      ? "hsl(0 84% 51% / 0.3)"
                      : bdPreview.milestone
                        ? "hsl(142 72% 37% / 0.3)"
                        : "hsl(var(--border))"
                  }`,
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                {bdPreview.alreadyExists ? (
                  <span style={{ color: "hsl(0 84% 51%)", fontWeight: 700 }}>
                    ✕ {bdMember.name} already has a check-in on this date.
                  </span>
                ) : (
                  <>
                    <span
                      style={{
                        color: "hsl(var(--foreground))",
                        fontWeight: 700,
                      }}
                    >
                      {bdMember.name}
                    </span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      {" "}
                      · Currently {bdMember.checkIns.length} check-ins →{" "}
                    </span>
                    <span
                      style={{ color: "hsl(20 100% 50%)", fontWeight: 700 }}
                    >
                      {bdPreview.newTotal} after this entry
                    </span>
                    {bdPreview.milestone && (
                      <span
                        style={{
                          marginLeft: 8,
                          color: "hsl(142 72% 37%)",
                          fontWeight: 700,
                        }}
                      >
                        🎉 This will trigger a reward!
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn
                variant="primary"
                onClick={handleBackdate}
                disabled={
                  bdSubmitting ||
                  !bdUid ||
                  !bdDate ||
                  !!bdPreview?.alreadyExists
                }
              >
                {bdSubmitting ? "Saving…" : "📅 Save Backdated Check-In"}
              </Btn>
              <Btn variant="subtle" size="sm" onClick={loadMembers}>
                ↻ Refresh Members
              </Btn>
            </div>
          </div>

          {/* Member check-in history preview */}
          {bdMember && bdMember.checkIns.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                {bdMember.name}'s Check-In History ({bdMember.checkIns.length})
              </div>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {[...bdMember.checkIns]
                  .slice()
                  .reverse()
                  .map((ci: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: "hsl(var(--secondary))",
                        fontSize: 12,
                      }}
                    >
                      <span
                        style={{
                          color: "hsl(var(--foreground))",
                          fontWeight: 600,
                        }}
                      >
                        {ci.date}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>
                          {ci.time}
                        </span>
                        {ci.backdated && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 6px",
                              borderRadius: 20,
                              background: "hsl(38 92% 44% / 0.12)",
                              color: "hsl(38 92% 44%)",
                            }}
                          >
                            backdated
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ad Enquiries Manager ──────────────────────────────────────────────────────
function AdEnquiriesManager({ toast }: any) {
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "ad_enquiries"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([k, v]: [string, any]) => ({ key: k, ...v }),
        );
        setEnquiries(
          list.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
        );
      } else setEnquiries([]);
    } catch {
      toast("Failed to load enquiries", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (key: string, status: string) => {
    await set(ref(db, `ad_enquiries/${key}/status`), status);
    setEnquiries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, status } : e)),
    );
    toast(`Status updated to ${status}`, "success");
  };

  // New function to save admin notes
  const updateNote = async (key: string, note: string) => {
    await set(ref(db, `ad_enquiries/${key}/adminNote`), note);
    setEnquiries((prev) =>
      prev.map((e) => (e.key === key ? { ...e, adminNote: note } : e)),
    );
    toast("Note saved", "success");
  };

  const deleteEnquiry = async (key: string) => {
    if (!confirm("Delete this enquiry?")) return;
    await remove(ref(db, `ad_enquiries/${key}`));
    setEnquiries((prev) => prev.filter((e) => e.key !== key));
    toast("Deleted", "info");
  };

  const STATUS_COLORS: any = {
    new: { bg: "hsl(20 100% 50% / 0.15)", color: "hsl(20 100% 50%)" },
    contacted: { bg: "hsl(217 91% 53% / 0.15)", color: "hsl(217 91% 53%)" },
    confirmed: { bg: "hsl(142 72% 37% / 0.15)", color: "hsl(142 72% 37%)" },
    declined: { bg: "hsl(0 84% 51% / 0.15)", color: "hsl(0 84% 51%)" },
  };

  const filtered =
    filter === "all" ? enquiries : enquiries.filter((e) => e.status === filter);

  // Style helpers for label and textarea
  const lblStyle = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    color: "hsl(var(--muted-foreground))",
    display: "block",
    marginBottom: 4,
  };
  const inpStyle = {
    width: "100%",
    padding: "8px 10px",
    background: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 12,
    color: "hsl(var(--foreground))",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Ad Enquiries ({enquiries.length})
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "new", "contacted", "confirmed", "declined"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "capitalize",
                background:
                  filter === s ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
                color: filter === s ? "#000" : "hsl(var(--foreground))",
                border: filter === s ? "none" : "1px solid hsl(var(--border))",
              }}
            >
              {s}
            </button>
          ))}
          <Btn variant="subtle" size="sm" onClick={load}>
            ↻ Refresh
          </Btn>
        </div>
      </div>
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No enquiries found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((e) => {
            const sc = STATUS_COLORS[e.status] || STATUS_COLORS.new;
            return (
              <div
                key={e.key}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "14px 16px",
                  borderLeft: `3px solid ${sc.color}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {e.bizName}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: sc.bg,
                          color: sc.color,
                          textTransform: "capitalize",
                        }}
                      >
                        {e.status}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--muted-foreground))",
                        marginTop: 3,
                      }}
                    >
                      {e.contactName} · {e.email} {e.phone && `· ${e.phone}`}
                    </div>
                    {e.message && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "hsl(var(--foreground))",
                          marginTop: 6,
                          fontStyle: "italic",
                        }}
                      >
                        "{e.message}"
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn
                      variant="subtle"
                      size="sm"
                      onClick={() => updateStatus(e.key, "contacted")}
                    >
                      Contacted
                    </Btn>
                    <Btn
                      variant="green"
                      size="sm"
                      onClick={() => updateStatus(e.key, "confirmed")}
                    >
                      ✓ Confirmed
                    </Btn>
                    <Btn
                      variant="danger"
                      size="sm"
                      onClick={() => deleteEnquiry(e.key)}
                    >
                      Delete
                    </Btn>
                  </div>
                </div>
                <a
                  href={`mailto:${e.email}?subject=Re: Advertising Enquiry — MK Two Rivers`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "hsl(217 91% 53%)",
                    textDecoration: "none",
                  }}
                >
                  ✉ Reply via email →
                </a>

                {/* Progress notes section – auto‑saves on blur */}
                <div style={{ marginTop: 10 }}>
                  <label style={lblStyle}>Progress notes</label>
                  <textarea
                    style={{
                      ...inpStyle,
                      minHeight: 56,
                      resize: "vertical",
                      marginTop: 4,
                    }}
                    placeholder="e.g. Called 12 Jun — interested in 3-month banner…"
                    defaultValue={e.adminNote ?? ""}
                    onBlur={(ev) => updateNote(e.key, ev.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Feedback Manager ──────────────────────────────────────────────────────────
function FeedbackManager({ toast }: any) {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [reviewUrl, setReviewUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  const TYPES = [
    "all",
    "Feature suggestion",
    "Bug / issue report",
    "App improvement",
    "General comment",
  ];

  useEffect(() => {
    get(ref(db, "admin_config/googleReviewUrl")).then((snap) => {
      if (snap.exists()) setReviewUrl(snap.val());
    });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "app_feedback"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([k, v]: [string, any]) => ({ key: k, ...v }),
        );
        setFeedback(
          list.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          ),
        );
      } else setFeedback([]);
    } catch {
      toast("Failed to load feedback", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const deleteFb = async (key: string) => {
    if (!confirm("Delete this feedback?")) return;
    await remove(ref(db, `app_feedback/${key}`));
    setFeedback((prev) => prev.filter((f) => f.key !== key));
    toast("Deleted", "info");
  };

  const saveReviewUrl = async () => {
    setSavingUrl(true);
    try {
      await set(ref(db, "admin_config/googleReviewUrl"), reviewUrl);
      toast("Google Review URL saved ✓", "success");
    } catch {
      toast("Failed to save URL", "error");
    }
    setSavingUrl(false);
  };

  const avgRating = feedback.length
    ? (
        feedback.reduce((s, f) => s + (f.rating || 0), 0) / feedback.length
      ).toFixed(1)
    : "—";
  const filtered =
    filter === "all" ? feedback : feedback.filter((f) => f.type === filter);

  return (
    <div>
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "14px 16px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
          ⭐ Google Review Link
        </div>
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 10,
          }}
        >
          This link appears on the Contact & Feedback page for members to leave
          a review.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--background))",
              color: "hsl(var(--foreground))",
              fontSize: 13,
              outline: "none",
            }}
            placeholder="https://g.page/r/your-review-link"
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
          />
          <Btn
            variant="primary"
            size="sm"
            onClick={saveReviewUrl}
            disabled={savingUrl}
          >
            {savingUrl ? "Saving…" : "Save"}
          </Btn>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          App Feedback ({feedback.length}) · Avg: {avgRating}★
        </div>
        <Btn variant="subtle" size="sm" onClick={load}>
          ↻ Refresh
        </Btn>
      </div>

      <div
        style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
      >
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              background:
                filter === t ? "hsl(217 91% 53%)" : "hsl(var(--secondary))",
              color: filter === t ? "#fff" : "hsl(var(--foreground))",
              border: filter === t ? "none" : "1px solid hsl(var(--border))",
            }}
          >
            {t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No feedback yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((f) => (
            <div
              key={f.key}
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                padding: "12px 16px",
                borderLeft: "3px solid hsl(217 91% 53%)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {f.name}
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: "hsl(217 91% 53% / 0.15)",
                        color: "hsl(217 91% 53%)",
                        fontWeight: 700,
                      }}
                    >
                      {f.type}
                    </span>
                    <span
                      style={{
                        color: "hsl(38 92% 44%)",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {"★".repeat(f.rating || 0)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {f.email} ·{" "}
                    {new Date(f.timestamp).toLocaleDateString("en-ZA")}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "hsl(var(--foreground))",
                      marginTop: 6,
                      lineHeight: 1.6,
                    }}
                  >
                    {f.message}
                  </div>
                </div>
                <Btn variant="danger" size="sm" onClick={() => deleteFb(f.key)}>
                  Delete
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notifications Manager ─────────────────────────────────────────────────────
function NotificationsManager({ toast }: any) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [subTab, setSubTab] = useState<"broadcast" | "member" | "compose">(
    "broadcast",
  );

  // Broadcast (global) notifications
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);

  // Per-member notifications
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const [memberNotifs, setMemberNotifs] = useState<any[]>([]);
  const [memberNotifsLoading, setMemberNotifsLoading] = useState(false);

  // Compose
  const [composeTarget, setComposeTarget] = useState<"all" | "member">("all");
  const [composeUid, setComposeUid] = useState("");
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeType, setComposeType] = useState("announcement");
  const [sending, setSending] = useState(false);

  // ── Load broadcasts ────────────────────────────────────────────────────────
  const loadBroadcasts = async () => {
    setBroadcastsLoading(true);
    try {
      const snap = await get(ref(db, "notifications"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([k, v]: [string, any]) => ({
            key: k,
            ...v,
          }),
        );
        setBroadcasts(
          list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        );
      } else {
        setBroadcasts([]);
      }
    } catch {
      toast("Failed to load notifications", "error");
    }
    setBroadcastsLoading(false);
  };

  // ── Load members for picker ────────────────────────────────────────────────
  const loadMembers = async () => {
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([uid, v]: [string, any]) => ({
            uid,
            name: v.name || "Unnamed",
            email: v.email || "",
          }),
        );
        setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    loadBroadcasts();
    loadMembers();
  }, []);

  // ── Load per-member notifications ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedMember) {
      setMemberNotifs([]);
      return;
    }
    setMemberNotifsLoading(true);
    get(ref(db, `users/${selectedMember}/notifications`)).then((snap) => {
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([k, v]: [string, any]) => ({
            key: k,
            ...v,
          }),
        );
        setMemberNotifs(
          list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        );
      } else {
        setMemberNotifs([]);
      }
      setMemberNotifsLoading(false);
    });
  }, [selectedMember]);

  // ── Delete broadcast ───────────────────────────────────────────────────────
  const deleteBroadcast = async (key: string) => {
    if (!confirm("Delete this notification?")) return;
    await remove(ref(db, `notifications/${key}`));
    setBroadcasts((prev) => prev.filter((n) => n.key !== key));
    toast("Deleted", "info");
  };

  // ── Delete member notification ─────────────────────────────────────────────
  const deleteMemberNotif = async (key: string) => {
    if (!confirm("Delete this notification?")) return;
    await remove(ref(db, `users/${selectedMember}/notifications/${key}`));
    setMemberNotifs((prev) => prev.filter((n) => n.key !== key));
    toast("Deleted", "info");
  };

  // ── Mark member notif as read ──────────────────────────────────────────────
  const markRead = async (key: string) => {
    await set(
      ref(db, `users/${selectedMember}/notifications/${key}/read`),
      true,
    );
    setMemberNotifs((prev) =>
      prev.map((n) => (n.key === key ? { ...n, read: true } : n)),
    );
  };

  // ── Send notification ──────────────────────────────────────────────────────
  const send = async () => {
    if (!composeTitle.trim()) return toast("Enter a title", "error");
    if (!composeBody.trim()) return toast("Enter a message", "error");
    if (composeTarget === "member" && !composeUid)
      return toast("Select a member", "error");

    setSending(true);
    try {
      const payload = {
        title: composeTitle,
        body: composeBody,
        type: composeType,
        read: false,
        createdAt: Date.now(),
        sentByAdmin: true,
      };

      if (composeTarget === "all") {
        // Broadcast to global feed
        await Promise.resolve(push(ref(db, "notifications"), payload));

        // Then to every member's personal feed
        const membersSnap = await get(ref(db, "mk2_users"));
        if (membersSnap.exists()) {
          const writes = Object.keys(membersSnap.val()).map((uid) =>
            Promise.resolve(
              push(ref(db, `users/${uid}/notifications`), payload),
            ),
          );
          await Promise.all(writes);
        }

        toast(`Broadcast sent to all members ✓`, "success");
        loadBroadcasts();
      } else {
        // Single member
        await Promise.resolve(
          push(ref(db, `users/${composeUid}/notifications`), payload),
        );
        toast("Notification sent ✓", "success");
        if (selectedMember === composeUid) {
          setMemberNotifs((prev) => [
            { key: Date.now().toString(), ...payload },
            ...prev,
          ]);
        }
      }

      setComposeTitle("");
      setComposeBody("");
      setComposeType("announcement");
      setComposeUid("");
    } catch {
      toast("Send failed", "error");
    }
    setSending(false);
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const TYPE_META: Record<
    string,
    { label: string; color: string; bg: string }
  > = {
    announcement: {
      label: "Announcement",
      color: "hsl(20 100% 50%)",
      bg: "hsl(20 100% 50% / 0.12)",
    },
    challenge: {
      label: "Challenge",
      color: "hsl(263 85% 58%)",
      bg: "hsl(263 85% 58% / 0.12)",
    },
    class_cancelled: {
      label: "Class cancelled",
      color: "hsl(0 84% 51%)",
      bg: "hsl(0 84% 51% / 0.12)",
    },
    reward: {
      label: "Reward",
      color: "hsl(142 72% 37%)",
      bg: "hsl(142 72% 37% / 0.12)",
    },
    general: {
      label: "General",
      color: "hsl(var(--muted-foreground))",
      bg: "hsl(var(--secondary))",
    },
  };

  const typeMeta = (type: string) => TYPE_META[type] ?? TYPE_META.general;

  const NotifRow = ({
    notif,
    onDelete,
    onRead,
    showRead = false,
  }: {
    notif: any;
    onDelete: () => void;
    onRead?: () => void;
    showRead?: boolean;
  }) => {
    const meta = typeMeta(notif.type);
    return (
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 0",
          borderBottom: "1px solid hsl(var(--border))",
          opacity: showRead && notif.read ? 0.55 : 1,
        }}
      >
        {/* Type dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: notif.read ? "hsl(var(--border))" : meta.color,
            flexShrink: 0,
            marginTop: 5,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 3,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 13 }}>{notif.title}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 20,
                background: meta.bg,
                color: meta.color,
              }}
            >
              {meta.label}
            </span>
            {showRead && !notif.read && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 20,
                  background: "hsl(217 91% 53% / 0.12)",
                  color: "hsl(217 91% 53%)",
                }}
              >
                Unread
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "hsl(var(--foreground))",
              marginBottom: 4,
              lineHeight: 1.5,
            }}
          >
            {notif.body}
          </div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            {notif.createdAt
              ? new Date(notif.createdAt).toLocaleString("en-ZA", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexShrink: 0,
            alignItems: "flex-start",
          }}
        >
          {showRead && !notif.read && onRead && (
            <Btn variant="subtle" size="sm" onClick={onRead}>
              ✓ Mark read
            </Btn>
          )}
          <Btn variant="danger" size="sm" onClick={onDelete}>
            Delete
          </Btn>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Notifications
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        View system notifications, member alerts, and send new ones.
      </div>

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          { id: "broadcast" as const, label: "📡 Broadcasts" },
          { id: "member" as const, label: "👤 Member inbox" },
          { id: "compose" as const, label: "✉ Send new" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background: subTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color: subTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BROADCASTS ── */}
      {subTab === "broadcast" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Global broadcasts ({broadcasts.length})
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                variant="primary"
                size="sm"
                onClick={() => setSubTab("compose")}
              >
                + Send new
              </Btn>
              <Btn variant="subtle" size="sm" onClick={loadBroadcasts}>
                ↻ Refresh
              </Btn>
            </div>
          </div>

          <div
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "4px 16px",
            }}
          >
            {broadcastsLoading ? (
              <div
                style={{
                  padding: "20px 0",
                  fontSize: 13,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                Loading…
              </div>
            ) : broadcasts.length === 0 ? (
              <div
                style={{
                  padding: "20px 0",
                  fontSize: 13,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                No broadcasts yet. Use "Send new" to create one.
              </div>
            ) : (
              broadcasts.map((n) => (
                <NotifRow
                  key={n.key}
                  notif={n}
                  onDelete={() => deleteBroadcast(n.key)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* ── MEMBER INBOX ── */}
      {subTab === "member" && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Select member</label>
            <select
              style={{ ...inp, maxWidth: 400 }}
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
            >
              <option value="">— Choose a member —</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          {selectedMember && (
            <div
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                padding: "4px 16px",
              }}
            >
              {memberNotifsLoading ? (
                <div
                  style={{
                    padding: "20px 0",
                    fontSize: 13,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Loading…
                </div>
              ) : memberNotifs.length === 0 ? (
                <div
                  style={{
                    padding: "20px 0",
                    fontSize: 13,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  No notifications for this member.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0 8px",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--muted-foreground))",
                      }}
                    >
                      {memberNotifs.length} notification
                      {memberNotifs.length !== 1 ? "s" : ""} ·{" "}
                      {memberNotifs.filter((n) => !n.read).length} unread
                    </span>
                    <Btn
                      variant="subtle"
                      size="sm"
                      onClick={async () => {
                        // Mark all as read
                        const writes: Promise<any>[] = memberNotifs
                          .filter((n) => !n.read)
                          .map((n) =>
                            set(
                              ref(
                                db,
                                `users/${selectedMember}/notifications/${n.key}/read`,
                              ),
                              true,
                            ),
                          );
                        await Promise.all(writes);
                        setMemberNotifs((prev) =>
                          prev.map((n) => ({ ...n, read: true })),
                        );
                        toast("All marked as read ✓", "success");
                      }}
                    >
                      ✓ Mark all read
                    </Btn>
                  </div>
                  {memberNotifs.map((n) => (
                    <NotifRow
                      key={n.key}
                      notif={n}
                      showRead
                      onDelete={() => deleteMemberNotif(n.key)}
                      onRead={() => markRead(n.key)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── COMPOSE ── */}
      {subTab === "compose" && (
        <div style={{ maxWidth: 560 }}>
          {/* Target */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>Send to</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["all", "member"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setComposeTarget(t)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor:
                      composeTarget === t
                        ? "hsl(20 100% 50%)"
                        : "hsl(var(--border))",
                    background:
                      composeTarget === t ? "hsl(20 100% 50%)" : "transparent",
                    color:
                      composeTarget === t ? "#000" : "hsl(var(--foreground))",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {t === "all" ? "📡 All members" : "👤 One member"}
                </button>
              ))}
            </div>
          </div>

          {composeTarget === "member" && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Member *</label>
              <select
                style={inp}
                value={composeUid}
                onChange={(e) => setComposeUid(e.target.value)}
              >
                <option value="">— Choose member —</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Type</label>
            <select
              style={inp}
              value={composeType}
              onChange={(e) => setComposeType(e.target.value)}
            >
              <option value="announcement">Announcement</option>
              <option value="challenge">Challenge</option>
              <option value="reward">Reward</option>
              <option value="general">General</option>
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Title *</label>
            <input
              style={inp}
              placeholder="e.g. Gym closed public holiday"
              value={composeTitle}
              onChange={(e) => setComposeTitle(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Message *</label>
            <textarea
              style={{ ...inp, minHeight: 90, resize: "vertical" }}
              placeholder="Write your message here…"
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
            />
          </div>

          {/* Preview */}
          {(composeTitle || composeBody) && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                borderLeft: `3px solid ${typeMeta(composeType).color}`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 6,
                }}
              >
                Preview
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                {composeTitle || "—"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
                  lineHeight: 1.5,
                }}
              >
                {composeBody || "—"}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {composeTarget === "all"
                  ? `Will be sent to all ${members.length} members`
                  : (members.find((m) => m.uid === composeUid)?.name ?? "—")}
              </div>
            </div>
          )}

          <Btn
            variant="primary"
            onClick={send}
            disabled={sending || !composeTitle.trim() || !composeBody.trim()}
          >
            {sending
              ? "Sending…"
              : composeTarget === "all"
                ? `📡 Broadcast to all members`
                : "✉ Send to member"}
          </Btn>

          {composeTarget === "all" && (
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                padding: "8px 12px",
                background: "hsl(38 92% 44% / 0.08)",
                border: "1px solid hsl(38 92% 44% / 0.2)",
                borderRadius: 8,
              }}
            >
              ⚠ This will add a notification to every member's inbox. Cannot be
              undone — double-check the message before sending.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Push Notifications Manager ─────────────────────────────────────────────────────
function PushNotificationsManager({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"broadcast" | "single">("broadcast");

  // Broadcast form
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcType, setBcType] = useState("announcement");
  const [bcSending, setBcSending] = useState(false);
  const [bcResult, setBcResult] = useState<{
    successCount: number;
    failureCount: number;
  } | null>(null);

  // Single member form
  const [smUid, setSmUid] = useState("");
  const [smTitle, setSmTitle] = useState("");
  const [smBody, setSmBody] = useState("");
  const [smType, setSmType] = useState("announcement");
  const [smSending, setSmSending] = useState(false);

  // Load members + their token status
  useEffect(() => {
    get(ref(db, "mk2_users")).then((snap) => {
      if (!snap.exists()) {
        setLoading(false);
        return;
      }
      const list = Object.entries(snap.val()).map(
        ([uid, v]: [string, any]) => ({
          uid,
          name: v.name || "Unnamed",
          email: v.email || "",
          fcmToken: v.fcmToken || null,
          fcmUpdatedAt: v.fcmUpdatedAt || null,
        }),
      );
      setMembers(list.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
  }, []);

  const withTokens = members.filter((m) => m.fcmToken);
  const withoutTokens = members.filter((m) => !m.fcmToken);
  const selectedMember = members.find((m) => m.uid === smUid);

  // ── Broadcast ──────────────────────────────────────────────────────────────
  const sendBroadcast = async () => {
    if (!bcTitle.trim()) return toast("Enter a title", "error");
    if (!bcBody.trim()) return toast("Enter a message", "error");
    if (withTokens.length === 0)
      return toast("No members have push enabled", "error");

    setBcSending(true);
    setBcResult(null);
    try {
      const functions = getFunctions(undefined, "europe-west1");
      const sendFn = httpsCallable(functions, "sendPushBroadcast");
      const tokens = withTokens.map((m) => m.fcmToken);
      const result: any = await sendFn({
        tokens,
        title: bcTitle,
        body: bcBody,
        type: bcType,
      });

      setBcResult(result.data);
      toast(
        `Sent ✓ — ${result.data.successCount} delivered, ${result.data.failureCount} failed`,
        result.data.failureCount > 0 ? "info" : "success",
      );

      // Write to notifications/ so the Notifications tab stays in sync
      await Promise.resolve(
        push(ref(db, "notifications"), {
          title: bcTitle,
          body: bcBody,
          type: bcType,
          read: false,
          createdAt: Date.now(),
          sentByAdmin: true,
          pushedToDevices: true,
          deliveredCount: result.data.successCount,
        }),
      );

      setBcTitle("");
      setBcBody("");
      setBcType("announcement");
    } catch (err: any) {
      toast(err?.message ?? "Broadcast failed", "error");
    }
    setBcSending(false);
  };

  // ── Single member ──────────────────────────────────────────────────────────
  const sendSingle = async () => {
    if (!smUid) return toast("Select a member", "error");
    if (!smTitle.trim()) return toast("Enter a title", "error");
    if (!smBody.trim()) return toast("Enter a message", "error");
    if (!selectedMember?.fcmToken)
      return toast("This member hasn't enabled push notifications", "error");

    setSmSending(true);
    try {
      const functions = getFunctions(undefined, "europe-west1");
      const sendFn = httpsCallable(functions, "sendPushNotification");
      await sendFn({
        token: selectedMember.fcmToken,
        title: smTitle,
        body: smBody,
        type: smType,
      });

      // Write to member's personal inbox too
      await Promise.resolve(
        push(ref(db, `users/${smUid}/notifications`), {
          title: smTitle,
          body: smBody,
          type: smType,
          read: false,
          createdAt: Date.now(),
          sentByAdmin: true,
          pushedToDevice: true,
        }),
      );

      toast(`Push sent to ${selectedMember.name} ✓`, "success");
      setSmUid("");
      setSmTitle("");
      setSmBody("");
    } catch (err: any) {
      toast(err?.message ?? "Send failed", "error");
    }
    setSmSending(false);
  };

  const TYPE_OPTIONS = [
    { value: "announcement", label: "Announcement" },
    { value: "challenge", label: "Challenge" },
    { value: "reward", label: "Reward" },
    { value: "class_update", label: "Class update" },
    { value: "general", label: "General" },
  ];

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Push Notifications
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 16,
        }}
      >
        Send real device push notifications via FCM. Members must have opened
        the app and accepted notifications.
      </div>

      {/* Token coverage summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { label: "Total members", val: members.length, accent: false },
          { label: "Push enabled", val: withTokens.length, accent: true },
          { label: "No token yet", val: withoutTokens.length, accent: false },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: "14px 18px",
              borderLeft: s.accent ? "3px solid hsl(20 100% 50%)" : undefined,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: s.accent ? "hsl(20 100% 50%)" : "hsl(var(--foreground))",
                lineHeight: 1,
              }}
            >
              {loading ? "—" : s.val}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Warning if no tokens yet */}
      {!loading && withTokens.length === 0 && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            background: "hsl(38 92% 44% / 0.08)",
            border: "1px solid hsl(38 92% 44% / 0.25)",
            borderRadius: 10,
            fontSize: 12,
            color: "hsl(38 92% 44%)",
            lineHeight: 1.7,
          }}
        >
          ⚠ No members have FCM tokens yet. Make sure the updated
          NotificationSettings.tsx is deployed and members have accepted the
          notification permission prompt.
        </div>
      )}

      {/* Sub-tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          borderRadius: 10,
          background: "hsl(var(--secondary))",
          width: "fit-content",
          marginBottom: 24,
        }}
      >
        {[
          { id: "broadcast" as const, label: "📡 Broadcast to all" },
          { id: "single" as const, label: "👤 Single member" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 12,
              background: subTab === t.id ? "hsl(20 100% 50%)" : "transparent",
              color: subTab === t.id ? "#000" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BROADCAST ── */}
      {subTab === "broadcast" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Type</label>
            <select
              style={inp}
              value={bcType}
              onChange={(e) => setBcType(e.target.value)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Title *</label>
            <input
              style={inp}
              placeholder="e.g. Gym closed Saturday"
              value={bcTitle}
              onChange={(e) => setBcTitle(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Message *</label>
            <textarea
              style={{ ...inp, minHeight: 90, resize: "vertical" }}
              placeholder="Write your push message…"
              value={bcBody}
              onChange={(e) => setBcBody(e.target.value)}
            />
          </div>

          {/* Device preview */}
          {(bcTitle || bcBody) && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 8,
                }}
              >
                Device preview
              </div>
              <div
                style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "hsl(20 100% 50%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  🏋
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {bcTitle || "Title"}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {bcBody || "Message"}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 4,
                    }}
                  >
                    MK2R · now
                  </div>
                </div>
              </div>
            </div>
          )}

          <Btn
            variant="primary"
            onClick={sendBroadcast}
            disabled={bcSending || withTokens.length === 0}
          >
            {bcSending
              ? "Sending…"
              : `📡 Send to ${withTokens.length} device${withTokens.length !== 1 ? "s" : ""}`}
          </Btn>

          {bcResult && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: "hsl(142 72% 37% / 0.08)",
                border: "1px solid hsl(142 72% 37% / 0.25)",
                fontSize: 12,
                color: "hsl(142 72% 37%)",
              }}
            >
              ✓ Last send: {bcResult.successCount} delivered ·{" "}
              {bcResult.failureCount} failed
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              color: "hsl(var(--muted-foreground))",
              padding: "8px 12px",
              background: "hsl(38 92% 44% / 0.06)",
              border: "1px solid hsl(38 92% 44% / 0.18)",
              borderRadius: 8,
            }}
          >
            ⚠ This sends a device push AND writes to the Notifications tab.
            Cannot be undone.
          </div>
        </div>
      )}

      {/* ── SINGLE MEMBER ── */}
      {subTab === "single" && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Member *</label>
            <select
              style={inp}
              value={smUid}
              onChange={(e) => setSmUid(e.target.value)}
            >
              <option value="">— Choose member —</option>
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name} ({m.email}) {m.fcmToken ? "✓" : "— no token"}
                </option>
              ))}
            </select>
          </div>

          {selectedMember && (
            <div
              style={{
                marginBottom: 14,
                padding: "8px 12px",
                borderRadius: 8,
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            >
              {selectedMember.fcmToken ? (
                <span style={{ color: "hsl(142 72% 37%)", fontWeight: 700 }}>
                  ✓ Push enabled · last updated{" "}
                  {selectedMember.fcmUpdatedAt
                    ? new Date(selectedMember.fcmUpdatedAt).toLocaleDateString(
                        "en-ZA",
                      )
                    : "unknown"}
                </span>
              ) : (
                <span style={{ color: "hsl(0 84% 51%)", fontWeight: 700 }}>
                  ✕ No FCM token — this member hasn't enabled notifications
                </span>
              )}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Type</label>
            <select
              style={inp}
              value={smType}
              onChange={(e) => setSmType(e.target.value)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Title *</label>
            <input
              style={inp}
              placeholder="e.g. Your reward is expiring soon"
              value={smTitle}
              onChange={(e) => setSmTitle(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Message *</label>
            <textarea
              style={{ ...inp, minHeight: 90, resize: "vertical" }}
              placeholder="Write your message…"
              value={smBody}
              onChange={(e) => setSmBody(e.target.value)}
            />
          </div>

          <Btn
            variant="primary"
            onClick={sendSingle}
            disabled={smSending || !smUid || !selectedMember?.fcmToken}
          >
            {smSending ? "Sending…" : "✉ Send push"}
          </Btn>
        </div>
      )}

      {/* Members without tokens — collapsed */}
      {!loading && withoutTokens.length > 0 && (
        <details style={{ marginTop: 32 }}>
          <summary
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 700,
            }}
          >
            {withoutTokens.length} member{withoutTokens.length !== 1 ? "s" : ""}{" "}
            without push token
          </summary>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {withoutTokens.map((m) => (
              <div
                key={m.uid}
                style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: 700 }}>{m.name}</span>
                <span style={{ color: "hsl(var(--muted-foreground))" }}>
                  {m.email}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Community Manager ─────────────────────────────────────────────────────────
function CommunityManager({ toast }: any) {
  const [rooms, setRooms] = useState<string[]>([]);
  const [newRoom, setNewRoom] = useState("");
  const [newRoomDesc, setNewRoomDesc] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollHours, setPollHours] = useState(24);
  const [sendingPoll, setSendingPoll] = useState(false);

  useEffect(() => {
    get(ref(db, "community_rooms")).then((snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setRooms(Object.values(data).map((r: any) => r.name));
      } else {
        setRooms([
          "💬 MK2R General",
          "🏆 MK2R Competitive Group",
          "🔥 MK2R Hyrox",
          "💼 MK2R Business Hub",
        ]);
      }
    });
  }, []);

  const addRoom = async () => {
    const trimmed = newRoom.trim();
    if (!trimmed) return toast("Enter a room name", "error");
    if (rooms.includes(trimmed)) return toast("Room already exists", "error");
    setSavingRoom(true);
    try {
      const updated = [...rooms, trimmed];
      const roomsObj = updated.reduce((acc: any, name, i) => {
        acc[`room_${i}`] = {
          name,
          desc: i === rooms.length ? newRoomDesc : "",
        };
        return acc;
      }, {});
      await set(ref(db, "community_rooms"), roomsObj);
      setRooms(updated);
      setNewRoom("");
      setNewRoomDesc("");
      toast(`Room "${trimmed}" created ✓`, "success");
    } catch {
      toast("Failed to create room", "error");
    }
    setSavingRoom(false);
  };

  const deleteRoom = async (roomName: string) => {
    if (!confirm(`Delete "${roomName}"? All messages will be lost.`)) return;
    try {
      const updated = rooms.filter((r) => r !== roomName);
      const roomsObj = updated.reduce((acc: any, name, i) => {
        acc[`room_${i}`] = { name, desc: "" };
        return acc;
      }, {});
      await set(ref(db, "community_rooms"), roomsObj);
      await remove(ref(db, `rooms/${roomName}`));
      setRooms(updated);
      toast("Room deleted", "info");
    } catch {
      toast("Delete failed", "error");
    }
  };

  const sendPoll = async () => {
    if (!selectedRoom) return toast("Select a room", "error");
    if (!pollQuestion.trim()) return toast("Enter a question", "error");
    const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2)
      return toast("At least 2 options required", "error");
    if (pollHours <= 0) return toast("Set a duration", "error");
    setSendingPoll(true);
    try {
      await push(ref(db, `rooms/${selectedRoom}/polls`), {
        type: "poll",
        question: pollQuestion,
        options: cleanOptions,
        votes: {},
        uid: "admin",
        user: "MK2 Admin",
        createdAt: Date.now(),
        expiresAt: Date.now() + pollHours * 3600000,
      });
      toast(`Poll sent to "${selectedRoom}" ✓`, "success");
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollHours(24);
      setSelectedRoom("");
    } catch {
      toast("Failed to send poll", "error");
    }
    setSendingPoll(false);
  };

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Community Chat
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Manage chat rooms and create polls for members.
      </div>

      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
        Chat Rooms ({rooms.length})
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {rooms.map((roomName) => (
          <div
            key={roomName}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 10,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 13 }}>{roomName}</span>
            <Btn
              variant="danger"
              size="sm"
              onClick={() => deleteRoom(roomName)}
            >
              Delete
            </Btn>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 28,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
          + New Chat Room
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={lbl}>Room Name *</label>
            <input
              style={inp}
              placeholder="e.g. 🧘 MK2R Yoga"
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRoom()}
            />
          </div>
          <div>
            <label style={lbl}>Description</label>
            <input
              style={inp}
              placeholder="Short description…"
              value={newRoomDesc}
              onChange={(e) => setNewRoomDesc(e.target.value)}
            />
          </div>
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={addRoom}
          disabled={savingRoom}
        >
          {savingRoom ? "Creating…" : "Create Room"}
        </Btn>
      </div>

      <div
        style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 24 }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
          📊 Create Poll
        </div>
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 16,
          }}
        >
          Send a poll to any chat room. Only admins can create polls.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={lbl}>Room *</label>
            <select
              style={inp}
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value="">— Select room —</option>
              {rooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Duration (hours) *</label>
            <select
              style={inp}
              value={pollHours}
              onChange={(e) => setPollHours(Number(e.target.value))}
            >
              {[1, 2, 4, 6, 12, 24, 48, 72].map((h) => (
                <option key={h} value={h}>
                  {h}h
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Question *</label>
            <input
              style={inp}
              placeholder="What do you want to ask members?"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Options *</label>
          {pollOptions.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...inp, flex: 1 }}
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const updated = [...pollOptions];
                  updated[i] = e.target.value;
                  setPollOptions(updated);
                }}
              />
              {pollOptions.length > 2 && (
                <button
                  onClick={() =>
                    setPollOptions(pollOptions.filter((_, j) => j !== i))
                  }
                  style={{
                    background: "hsl(0 84% 51% / 0.1)",
                    border: "1px solid hsl(0 84% 51% / 0.3)",
                    color: "hsl(0 84% 51%)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setPollOptions([...pollOptions, ""])}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px dashed hsl(20 100% 50% / 0.4)",
              background: "hsl(20 100% 50% / 0.06)",
              color: "hsl(20 100% 50%)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
            }}
          >
            + Add Option
          </button>
        </div>
        <Btn variant="primary" onClick={sendPoll} disabled={sendingPoll}>
          {sendingPoll ? "Sending…" : "📊 Send Poll to Room"}
        </Btn>
      </div>
    </div>
  );
}

function InstagramSetup() {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>
        Instagram Auto-Sync Setup
      </div>
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(20 100% 50% / 0.3)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: "hsl(20 100% 50%)",
            marginBottom: 8,
          }}
        >
          Status: Pending Meta Approval
        </div>
        <div
          style={{
            fontSize: 13,
            color: "hsl(var(--muted-foreground))",
            lineHeight: 1.8,
          }}
        >
          Once approved, new posts on the gym's Instagram will automatically
          appear in the Gallery section.
        </div>
      </div>
    </div>
  );
}

// ── Terms Manager ─────────────────────────────────────────────────────────────
function TermsManager({ toast }: any) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "terms_acceptance"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([uid, val]: [string, any]) => ({ uid, ...val }),
        );
        setRecords(list.sort((a, b) => b.acceptedAt - a.acceptedAt));
      } else setRecords([]);
    } catch {
      toast("Failed to load records", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          T&C Acceptance Records ({records.length})
        </div>
        <Btn variant="subtle" size="sm" onClick={load}>
          ↻ Refresh
        </Btn>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 16,
          padding: "10px 14px",
          background: "hsl(142 72% 37% / 0.1)",
          border: "1px solid hsl(142 72% 37% / 0.3)",
          borderRadius: 8,
        }}
      >
        ✓ These records confirm each member has accepted the Terms & Conditions.
        POPIA compliant audit log.
      </div>
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : records.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No records yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {records.map((r) => (
            <div
              key={r.uid}
              style={{
                background: "hsl(var(--secondary))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 10,
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
                borderLeft: "3px solid hsl(142 72% 37%)",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 2,
                  }}
                >
                  {r.email} · Version: {r.termsVersion}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                  textAlign: "right",
                }}
              >
                <div style={{ fontWeight: 700, color: "hsl(142 72% 37%)" }}>
                  ✓ Accepted
                </div>
                <div>
                  {new Date(r.acceptedAt).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Banners Manager ───────────────────────────────────────────────────────────
function BannersManager({ toast }: any) {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const blank = {
    title: "",
    subtitle: "",
    emoji: "🔥",
    imageUrl: "",
    actionType: "url",
    actionValue: "",
    cta: "Learn More",
    size: "medium",
    status: "draft",
    activatesAt: "",
    periodMonths: "1",
    expiresAt: "",
  };
  const [form, setForm] = useState(blank);
  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!form.activatesAt || !form.periodMonths) return;
    const start = new Date(form.activatesAt);
    start.setMonth(start.getMonth() + parseInt(form.periodMonths));
    setForm((p) => ({ ...p, expiresAt: start.toISOString().split("T")[0] }));
  }, [form.activatesAt, form.periodMonths]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "ad_banners"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([id, val]: [string, any]) => ({ id, ...val }),
        );
        setBanners(
          list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        );
      } else setBanners([]);
    } catch {
      toast("Failed to load banners", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please select an image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Image must be under 5MB", "error");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const storage = getStorage();
      const fileName = `banners/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const sRef = storageRef(storage, fileName);
      const uploadTask = uploadBytesResumable(sRef, file);
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          setUploadProgress(
            Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          );
        },
        () => {
          toast("Upload failed", "error");
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setForm((p) => ({ ...p, imageUrl: url }));
          toast("Image uploaded ✓", "success");
          setUploading(false);
          setUploadProgress(0);
        },
      );
    } catch {
      toast("Upload error", "error");
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title) return toast("Enter a title", "error");
    if (!form.activatesAt) return toast("Set an activation date", "error");
    if (!form.actionValue)
      return toast("Enter an action URL, WhatsApp number or email", "error");

    let url = form.actionValue;
    if (form.actionType === "whatsapp") {
      const digits = form.actionValue.replace(/\D/g, "");
      url = `https://wa.me/${digits}`;
    } else if (form.actionType === "email") {
      url = `mailto:${form.actionValue}`;
    }

    try {
      await push(ref(db, "ad_banners"), {
        title: form.title,
        subtitle: form.subtitle,
        emoji: form.emoji,
        imageUrl: form.imageUrl,
        url,
        cta: form.cta,
        size: form.size,
        status: form.status,
        activatesAt: new Date(form.activatesAt).getTime(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).getTime() : null,
        periodMonths: parseInt(form.periodMonths),
        active: form.status === "published",
        createdAt: Date.now(),
      });
      toast("Banner created ✓", "success");
      setShowForm(false);
      setForm(blank);
      load();
    } catch {
      toast("Save failed", "error");
    }
  };

  const toggleStatus = async (banner: any) => {
    const newActive = !banner.active;
    await set(ref(db, `ad_banners/${banner.id}/active`), newActive);
    await set(
      ref(db, `ad_banners/${banner.id}/status`),
      newActive ? "published" : "draft",
    );
    toast(newActive ? "Banner published ✓" : "Banner set to draft", "info");
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    await remove(ref(db, `ad_banners/${id}`));
    toast("Deleted", "info");
    load();
  };

  const SIZE_LABELS: Record<string, string> = {
    small: "Small (notification strip)",
    medium: "Medium (card)",
    large: "Large (hero)",
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Ad Banners ({banners.length})
        </div>
        <Btn
          variant="primary"
          size="sm"
          onClick={() => {
            setShowForm(!showForm);
            setForm(blank);
          }}
        >
          {showForm ? "✕ Cancel" : "+ New Banner"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              New Banner
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Banner Image (optional)</label>
              {form.imageUrl ? (
                <div style={{ position: "relative", width: "fit-content" }}>
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    style={{
                      width: 220,
                      height: 100,
                      objectFit: "cover",
                      borderRadius: 8,
                      display: "block",
                    }}
                  />
                  <button
                    onClick={() => setForm((p) => ({ ...p, imageUrl: "" }))}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px dashed hsl(var(--border))",
                      background: "hsl(var(--card))",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {uploading
                      ? `Uploading… ${uploadProgress}%`
                      : "📁 Upload image (max 5MB)"}
                  </button>
                  {uploading && (
                    <div
                      style={{
                        marginTop: 8,
                        height: 4,
                        background: "hsl(var(--border))",
                        borderRadius: 2,
                        overflow: "hidden",
                        width: 200,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${uploadProgress}%`,
                          background: "hsl(20 100% 50%)",
                          borderRadius: 2,
                          transition: "width 0.2s",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Title *</label>
                <input
                  style={inp}
                  placeholder="e.g. Ruimsig Pharmacy"
                  value={form.title}
                  onChange={f("title")}
                />
              </div>
              <div>
                <label style={lbl}>Subtitle</label>
                <input
                  style={inp}
                  placeholder="Short tagline"
                  value={form.subtitle}
                  onChange={f("subtitle")}
                />
              </div>
              <div>
                <label style={lbl}>Emoji</label>
                <input
                  style={inp}
                  placeholder="🔥"
                  value={form.emoji}
                  onChange={f("emoji")}
                />
              </div>
              <div>
                <label style={lbl}>Button Text</label>
                <input
                  style={inp}
                  placeholder="Learn More"
                  value={form.cta}
                  onChange={f("cta")}
                />
              </div>
              <div>
                <label style={lbl}>Banner Size</label>
                <select style={inp} value={form.size} onChange={f("size")}>
                  <option value="small">Small — notification strip</option>
                  <option value="medium">Medium — card</option>
                  <option value="large">Large — hero</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={f("status")}>
                  <option value="draft">✎ Draft</option>
                  <option value="published">● Published</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Activation Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={form.activatesAt}
                  onChange={f("activatesAt")}
                />
              </div>
              <div>
                <label style={lbl}>Period</label>
                <select
                  style={inp}
                  value={form.periodMonths}
                  onChange={f("periodMonths")}
                >
                  {["1", "2", "3", "6", "12"].map((m) => (
                    <option key={m} value={m}>
                      {m} month{parseInt(m) > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Expiry Date (auto)</label>
                <input
                  style={{ ...inp, opacity: 0.7 }}
                  type="date"
                  value={form.expiresAt}
                  readOnly
                  placeholder="Set activation date + period"
                />
              </div>
            </div>

            <div
              style={{
                marginBottom: 14,
                padding: "14px 16px",
                background: "hsl(var(--background))",
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
                Action Button *
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                {(["url", "whatsapp", "email"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setForm((p) => ({ ...p, actionType: t, actionValue: "" }))
                    }
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: `1px solid ${form.actionType === t ? "hsl(20 100% 50%)" : "hsl(var(--border))"}`,
                      background:
                        form.actionType === t
                          ? "hsl(20 100% 50%)"
                          : "transparent",
                      color:
                        form.actionType === t
                          ? "#000"
                          : "hsl(var(--foreground))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {t === "url"
                      ? "🔗 URL"
                      : t === "whatsapp"
                        ? "💬 WhatsApp"
                        : "✉ Email"}
                  </button>
                ))}
              </div>
              <input
                style={inp}
                placeholder={
                  form.actionType === "url"
                    ? "https://yourbusiness.co.za"
                    : form.actionType === "whatsapp"
                      ? "e.g. 27821234567"
                      : "e.g. info@yourbusiness.co.za"
                }
                value={form.actionValue}
                onChange={f("actionValue")}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                  marginTop: 6,
                }}
              >
                {form.actionType === "whatsapp"
                  ? "Enter number with country code (no +). e.g. 27821234567"
                  : form.actionType === "email"
                    ? "Members will open their mail app to contact you."
                    : "Full URL including https://"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="primary" onClick={save} disabled={uploading}>
                Create Banner
              </Btn>
              <Btn variant="subtle" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : banners.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No banners yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {banners.map((b) => {
            const isPublished = b.active;
            const now = Date.now();
            const isExpired = b.expiresAt && now > b.expiresAt;
            const isPending = b.activatesAt && now < b.activatesAt;
            return (
              <div
                key={b.id}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  borderLeft: `3px solid ${isPublished && !isExpired ? "hsl(142 72% 37%)" : "hsl(var(--border))"}`,
                  opacity: isExpired ? 0.6 : 1,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {b.emoji} {b.title}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: isExpired
                          ? "hsl(0 84% 51% / 0.12)"
                          : isPublished
                            ? "hsl(142 72% 37% / 0.12)"
                            : "hsl(var(--secondary))",
                        color: isExpired
                          ? "hsl(0 84% 51%)"
                          : isPublished
                            ? "hsl(142 72% 37%)"
                            : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {isExpired
                        ? "⚠ Expired"
                        : isPublished
                          ? "● Published"
                          : "✎ Draft"}
                    </span>
                    {isPending && !isExpired && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: "hsl(38 92% 44% / 0.12)",
                          color: "hsl(38 92% 44%)",
                        }}
                      >
                        ⏳ Pending
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: "hsl(217 91% 53% / 0.12)",
                        color: "hsl(217 91% 53%)",
                      }}
                    >
                      {SIZE_LABELS[b.size] ?? b.size}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 3,
                    }}
                  >
                    {b.subtitle && `${b.subtitle} · `}
                    {b.activatesAt
                      ? `Starts ${new Date(b.activatesAt).toLocaleDateString("en-ZA")}`
                      : "No start date"}
                    {b.expiresAt
                      ? ` · Expires ${new Date(b.expiresAt).toLocaleDateString("en-ZA")}`
                      : " · No expiry"}
                    {b.periodMonths
                      ? ` · ${b.periodMonths} month${b.periodMonths > 1 ? "s" : ""}`
                      : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn
                    variant={isPublished ? "subtle" : "green"}
                    size="sm"
                    onClick={() => toggleStatus(b)}
                  >
                    {isPublished ? "Set Draft" : "Publish"}
                  </Btn>
                  <Btn variant="danger" size="sm" onClick={() => del(b.id)}>
                    Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Challenges Manager ────────────────────────────────────────────────────────
const CHALLENGE_METRICS = [
  { value: "reps", label: "Reps" },
  { value: "kg", label: "Weight (kg)" },
  { value: "lbs", label: "Weight (lbs)" },
  { value: "time", label: "Time (mm:ss)" },
  { value: "distance_m", label: "Distance (m)" },
  { value: "distance_km", label: "Distance (km)" },
  { value: "calories", label: "Calories" },
  { value: "rounds", label: "Rounds + Reps" },
];

function ChallengesManager({ toast }: any) {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const blank = {
    name: "",
    exercise: "",
    description: "",
    startDate: "",
    endDate: "",
    metric: "reps",
    prize: "",
    color: "hsl(20 100% 50%)",
    active: true,
  };
  const [form, setForm] = useState(blank);
  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "challenges"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([id, val]: [string, any]) => ({ id, ...val }),
        );
        setChallenges(
          list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        );
      } else setChallenges([]);
    } catch {
      toast("Failed to load challenges", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.name || !form.startDate || !form.endDate)
      return toast("Fill in Name, Start and End Date", "error");
    try {
      await push(ref(db, "challenges"), {
        ...form,
        active: form.active === true || (form.active as any) === "true",
        createdAt: Date.now(),
      });
      await push(ref(db, "notifications"), {
        title: "New Challenge! 🏁",
        body: `${form.name} — ${form.description || "Check it out in the app!"}`,
        type: "challenge",
        createdAt: Date.now(),
        read: false,
        prize: form.prize,
      });
      toast("Challenge created ✓ — members notified", "success");
      setShowForm(false);
      setForm(blank);
      load();
    } catch {
      toast("Save failed", "error");
    }
  };

  const toggleActive = async (c: any) => {
    await set(ref(db, `challenges/${c.id}/active`), !c.active);
    toast(c.active ? "Challenge hidden" : "Challenge active ✓", "info");
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this challenge and all its entries?")) return;
    await remove(ref(db, `challenges/${id}`));
    await remove(ref(db, `challenge_entries/${id}`));
    toast("Deleted", "info");
    load();
  };

  const COLORS = [
    "hsl(20 100% 50%)",
    "hsl(263 85% 58%)",
    "hsl(142 72% 37%)",
    "hsl(217 91% 53%)",
    "hsl(38 92% 44%)",
    "hsl(187 85% 40%)",
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          Challenges ({challenges.length})
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Challenge"}
        </Btn>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
              New Challenge
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={lbl}>Challenge Name *</label>
                <input
                  style={inp}
                  placeholder="e.g. 30-Day Squat Challenge"
                  value={form.name}
                  onChange={f("name")}
                />
              </div>
              <div>
                <label style={lbl}>Exercise</label>
                <input
                  style={inp}
                  placeholder="e.g. Back Squat"
                  value={form.exercise}
                  onChange={f("exercise")}
                />
              </div>
              <div>
                <label style={lbl}>Metric *</label>
                <select style={inp} value={form.metric} onChange={f("metric")}>
                  {CHALLENGE_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Prize</label>
                <input
                  style={inp}
                  placeholder="e.g. Free 1-month membership"
                  value={form.prize}
                  onChange={f("prize")}
                />
              </div>
              <div>
                <label style={lbl}>Start Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={form.startDate}
                  onChange={f("startDate")}
                />
              </div>
              <div>
                <label style={lbl}>End Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={form.endDate}
                  onChange={f("endDate")}
                />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select
                  style={inp}
                  value={String(form.active)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      active: e.target.value === "true",
                    }))
                  }
                >
                  <option value="true">✓ Active</option>
                  <option value="false">✕ Hidden</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Colour</label>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm((p) => ({ ...p, color: c }))}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: c,
                        border:
                          form.color === c
                            ? "3px solid white"
                            : "2px solid transparent",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Description</label>
              <textarea
                style={{ ...inp, minHeight: 60, resize: "vertical" }}
                placeholder="Describe the challenge…"
                value={form.description}
                onChange={f("description")}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 14,
                padding: "8px 12px",
                background: "hsl(142 72% 37% / 0.08)",
                borderRadius: 6,
                border: "1px solid hsl(142 72% 37% / 0.2)",
              }}
            >
              🔔 A notification will be sent to all members when this challenge
              is created.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="primary" onClick={save}>
                Create Challenge
              </Btn>
              <Btn variant="subtle" onClick={() => setShowForm(false)}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : challenges.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No challenges yet. Create one above!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {challenges.map((c) => {
            const metricLabel =
              CHALLENGE_METRICS.find((m) => m.value === c.metric)?.label ??
              c.metric;
            return (
              <div
                key={c.id}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 10,
                  borderLeft: `3px solid ${c.color}`,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {c.name}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: c.active
                          ? "hsl(142 72% 37% / 0.15)"
                          : "hsl(var(--secondary))",
                        color: c.active
                          ? "hsl(142 72% 37%)"
                          : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {c.active ? "● Active" : "○ Hidden"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "hsl(var(--muted-foreground))",
                      marginTop: 2,
                    }}
                  >
                    {c.startDate} → {c.endDate} · {metricLabel} · 🏆 {c.prize}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn
                    variant={c.active ? "subtle" : "green"}
                    size="sm"
                    onClick={() => toggleActive(c)}
                  >
                    {c.active ? "Deactivate" : "Activate"}
                  </Btn>
                  <Btn variant="danger" size="sm" onClick={() => del(c.id)}>
                    Delete
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div
        style={{
          marginTop: 20,
          padding: "10px 14px",
          background: "hsl(217 91% 53% / 0.1)",
          border: "1px solid hsl(217 91% 53% / 0.3)",
          borderRadius: 8,
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        ℹ️ Challenge entries are stored at{" "}
        <strong style={{ color: "hsl(217 91% 53%)" }}>
          challenge_entries/
        </strong>{" "}
        in Firebase. Notifications are stored at{" "}
        <strong style={{ color: "hsl(217 91% 53%)" }}>notifications/</strong>.
      </div>
    </div>
  );
}

// ── Rewards Manager ───────────────────────────────────────────────────────────
const CHECKINS_REQUIRED = 40;
const EXPIRY_DAYS = 60;

function ProgressBar({ pct, ready }: { pct: number; ready: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        background: "hsl(var(--border))",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.min(100, pct)}%`,
          height: "100%",
          background: ready ? "hsl(142 72% 37%)" : "hsl(20 100% 50%)",
          borderRadius: 4,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function RewardsManager({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ready" | "progress">("all");
  const [search, setSearch] = useState("");
  const [redeemTarget, setRedeemTarget] = useState<any>(null);
  const [rewardType, setRewardType] = useState<"inbody" | "buddy">("inbody");
  const [redeemNote, setRedeemNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrLookupResult, setQrLookupResult] = useState<{
    uid: string;
    rewardId: string;
    memberName: string;
    rewardCode: string;
    rewardType: string | null;
    earnedAt: number;
    expiresAt: number;
  } | null>(null);
  const [qrLookupError, setQrLookupError] = useState<string | null>(null);
  const [qrConfirmType, setQrConfirmType] = useState<"inbody" | "buddy">(
    "inbody",
  );
  const [qrConfirming, setQrConfirming] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setMembers([]);
        setLoading(false);
        return;
      }
      const list: any[] = [];
      Object.entries(snap.val()).forEach(([uid, val]: [string, any]) => {
        const totalCheckIns = Array.isArray(val.checkIns)
          ? val.checkIns.length
          : typeof val.checkIns === "number"
            ? val.checkIns
            : 0;
        const rewardsMap: Record<string, any> = val.rewards ?? {};
        const redemptions = Object.entries(rewardsMap)
          .filter(([, r]: [string, any]) => r.status === "redeemed")
          .map(([id, r]: [string, any]) => ({ id, ...r }))
          .sort((a, b) => b.redeemedAt - a.redeemedAt);
        const pendingRewards = Object.entries(rewardsMap)
          .filter(
            ([, r]: [string, any]) =>
              r.status === "pending" && Date.now() < r.expiresAt,
          )
          .map(([id, r]: [string, any]) => ({ id, ...r }));
        const lastRedeemedAt = redemptions[0]?.redeemedAt ?? 0;

        // ========== FIXED cycleCheckIns calculation ==========
        let cycleCheckIns = 0;
        if (Array.isArray(val.checkIns)) {
          if (lastRedeemedAt === 0) {
            // No redemptions yet — all check-ins count
            cycleCheckIns = val.checkIns.length;
          } else {
            cycleCheckIns = val.checkIns.filter((ci: any) => {
              // Handle {date, time} objects — parse DD/MM/YYYY
              if (typeof ci === "object" && ci?.date) {
                const parts = ci.date.split("/");
                if (parts.length === 3) {
                  const ts = new Date(
                    `${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`,
                  ).getTime();
                  return ts > lastRedeemedAt;
                }
                return false;
              }
              // Handle raw timestamps or ISO strings
              const ts =
                typeof ci === "number"
                  ? ci
                  : typeof ci === "string"
                    ? new Date(ci).getTime()
                    : 0;
              return ts > lastRedeemedAt;
            }).length;
          }
        } else {
          cycleCheckIns =
            typeof val.checkIns === "number"
              ? val.checkIns % CHECKINS_REQUIRED
              : 0;
        }
        // ====================================================

        const rewardReady =
          cycleCheckIns >= CHECKINS_REQUIRED || pendingRewards.length > 0;
        const pct = Math.min(100, (cycleCheckIns / CHECKINS_REQUIRED) * 100);
        const expiresAt =
          pendingRewards[0]?.expiresAt ??
          (lastRedeemedAt > 0
            ? lastRedeemedAt + EXPIRY_DAYS * 24 * 60 * 60 * 1000
            : Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        list.push({
          uid,
          name: val.name || "Unnamed",
          email: val.email || "",
          totalCheckIns,
          cycleCheckIns,
          pct,
          rewardReady,
          expired:
            rewardReady &&
            pendingRewards.length === 0 &&
            Date.now() > expiresAt,
          expiresAt,
          redemptions,
          pendingRewards,
        });
      });
      list.sort((a, b) => {
        if (a.rewardReady !== b.rewardReady) return a.rewardReady ? -1 : 1;
        return b.pct - a.pct;
      });
      setMembers(list);
    } catch {
      toast("Failed to load", "error");
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const handleRedeem = async () => {
    if (!redeemTarget) return;
    const pendingReward = redeemTarget.pendingRewards?.[0];
    if (!pendingReward) return toast("No pending reward found", "error");
    setSubmitting(true);
    try {
      await set(
        ref(db, `mk2_users/${redeemTarget.uid}/rewards/${pendingReward.id}`),
        {
          ...pendingReward,
          status: "redeemed",
          type: rewardType,
          redeemedAt: Date.now(),
          redeemedBy: "Admin",
          note: redeemNote || "Redeemed at reception",
        },
      );
      toast(
        `✓ ${rewardType === "inbody" ? "InBody Assessment" : "Bring-a-Buddy"} redeemed for ${redeemTarget.name}`,
        "success",
      );
      setRedeemTarget(null);
      setRedeemNote("");
      load();
    } catch {
      toast("Redemption failed", "error");
    }
    setSubmitting(false);
  };

  const lookupCode = async (code: string) => {
    setQrLookupError(null);
    setQrLookupResult(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setQrLookupError("No members found.");
        return;
      }
      const allUsers = snap.val();
      for (const [uid, val] of Object.entries(allUsers) as [string, any][]) {
        const rewardsMap: Record<string, any> = val.rewards ?? {};
        for (const [rewardId, r] of Object.entries(rewardsMap)) {
          if ((r as any).redemptionCode?.toUpperCase() === trimmed) {
            if ((r as any).status === "redeemed") {
              setQrLookupError(
                `This code has already been redeemed by ${val.name || "this member"}.`,
              );
              return;
            }
            if ((r as any).status === "expired") {
              setQrLookupError(
                `This reward expired on ${new Date((r as any).expiresAt).toLocaleDateString("en-ZA")}.`,
              );
              return;
            }
            if (Date.now() > (r as any).expiresAt) {
              setQrLookupError(
                `This reward has expired (${new Date((r as any).expiresAt).toLocaleDateString("en-ZA")}).`,
              );
              return;
            }
            setQrLookupResult({
              uid,
              rewardId,
              memberName: val.name || "Unnamed",
              rewardCode: (r as any).redemptionCode,
              rewardType: (r as any).type,
              earnedAt: (r as any).earnedAt,
              expiresAt: (r as any).expiresAt,
            });
            if ((r as any).type) setQrConfirmType((r as any).type);
            return;
          }
        }
      }
      setQrLookupError("Code not found — check it was entered correctly.");
    } catch {
      setQrLookupError("Lookup failed — try again.");
    }
  };

  const confirmQrRedemption = async () => {
    if (!qrLookupResult) return;
    setQrConfirming(true);
    try {
      const snap = await get(
        ref(
          db,
          `mk2_users/${qrLookupResult.uid}/rewards/${qrLookupResult.rewardId}`,
        ),
      );
      if (!snap.exists()) throw new Error("Reward not found");
      await set(
        ref(
          db,
          `mk2_users/${qrLookupResult.uid}/rewards/${qrLookupResult.rewardId}`,
        ),
        {
          ...snap.val(),
          status: "redeemed",
          type: qrConfirmType,
          redeemedAt: Date.now(),
          redeemedBy: "Admin",
        },
      );
      toast(
        `✓ ${qrConfirmType === "inbody" ? "InBody Assessment" : "Bring-a-Buddy"} redeemed for ${qrLookupResult.memberName}`,
        "success",
      );
      setQrLookupResult(null);
      setManualCode("");
      setShowQRScanner(false);
      load();
    } catch {
      toast("Redemption failed — try again", "error");
    }
    setQrConfirming(false);
  };

  const readyCount = members.filter((m) => m.rewardReady && !m.expired).length;
  const filtered = members
    .filter((m) =>
      filter === "ready"
        ? m.rewardReady && !m.expired
        : filter === "progress"
          ? !m.rewardReady
          : true,
    )
    .filter(
      (m) =>
        !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase()),
    );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Rewards Management
          </div>
          <div
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              marginTop: 4,
            }}
          >
            {CHECKINS_REQUIRED} check-ins = 1 reward · Redeem within{" "}
            {EXPIRY_DAYS} days
          </div>
        </div>
        {readyCount > 0 && (
          <div
            style={{
              background: "hsl(142 72% 37% / 0.12)",
              border: "1px solid hsl(142 72% 37% / 0.3)",
              borderRadius: 10,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: "hsl(142 72% 37%)",
            }}
          >
            🎁 {readyCount} member{readyCount !== 1 ? "s" : ""} ready to redeem
          </div>
        )}
      </div>

      {/* QR / Code Redemption Panel */}
      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          📷 Redeem by Code
        </div>
        <div
          style={{
            fontSize: 12,
            color: "hsl(var(--muted-foreground))",
            marginBottom: 14,
          }}
        >
          Scan the member's QR code or type their redemption code manually.
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <input
            style={{
              ...inp,
              flex: 1,
              minWidth: 200,
              fontFamily: "monospace",
              letterSpacing: "0.1em",
            }}
            placeholder="e.g. MK2R-XXXX-YYY"
            value={manualCode}
            onChange={(e) => {
              setManualCode(e.target.value.toUpperCase());
              setQrLookupError(null);
              setQrLookupResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && lookupCode(manualCode)}
          />
          <Btn
            variant="primary"
            size="sm"
            onClick={() => lookupCode(manualCode)}
            disabled={!manualCode.trim()}
          >
            Look Up →
          </Btn>
          <Btn
            variant="subtle"
            size="sm"
            onClick={() => {
              setShowQRScanner((v) => !v);
              setQrLookupError(null);
              setQrLookupResult(null);
              setManualCode("");
            }}
          >
            {showQRScanner ? "✕ Close Scanner" : "📷 Scan QR"}
          </Btn>
        </div>
        {showQRScanner && (
          <div
            style={{
              borderRadius: 10,
              overflow: "hidden",
              marginBottom: 12,
              border: "1px solid hsl(var(--border))",
            }}
          >
            <QRScanner
              onScan={(data) => {
                setShowQRScanner(false);
                setManualCode(data.toUpperCase());
                lookupCode(data);
              }}
            />
          </div>
        )}
        {qrLookupError && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "hsl(0 84% 51% / 0.08)",
              border: "1px solid hsl(0 84% 51% / 0.2)",
              color: "hsl(0 84% 51%)",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            ⚠ {qrLookupError}
          </div>
        )}
        {qrLookupResult && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(142 72% 37% / 0.4)",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                marginBottom: 2,
                color: "hsl(142 72% 37%)",
              }}
            >
              ✓ Valid reward found
            </div>
            <div
              style={{
                fontSize: 13,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 14,
              }}
            >
              <strong style={{ color: "hsl(var(--foreground))" }}>
                {qrLookupResult.memberName}
              </strong>{" "}
              · Code:{" "}
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                {qrLookupResult.rewardCode}
              </span>
              <br />
              Earned{" "}
              {new Date(qrLookupResult.earnedAt).toLocaleDateString("en-ZA")} ·
              Expires{" "}
              {new Date(qrLookupResult.expiresAt).toLocaleDateString("en-ZA")}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "hsl(var(--muted-foreground))",
                marginBottom: 8,
              }}
            >
              {qrLookupResult.rewardType
                ? "Member chose:"
                : "Choose reward type:"}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {(["inbody", "buddy"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setQrConfirmType(t)}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `2px solid ${qrConfirmType === t ? "hsl(20 100% 50%)" : "hsl(var(--border))"}`,
                    background:
                      qrConfirmType === t
                        ? "hsl(20 100% 50% / 0.08)"
                        : "transparent",
                    textAlign: "center",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 2 }}>
                    {t === "inbody" ? "📊" : "🤝"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color:
                        qrConfirmType === t
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--foreground))",
                    }}
                  >
                    {t === "inbody" ? "Free InBody" : "Bring-a-Buddy"}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                variant="green"
                onClick={confirmQrRedemption}
                disabled={qrConfirming}
              >
                {qrConfirming ? "Confirming…" : "✓ Confirm Redemption"}
              </Btn>
              <Btn
                variant="subtle"
                size="sm"
                onClick={() => {
                  setQrLookupResult(null);
                  setManualCode("");
                }}
              >
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </div>

      <div
        style={{
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          lineHeight: 1.7,
        }}
      >
        <strong style={{ color: "hsl(var(--foreground))" }}>
          Reward Rules:{" "}
        </strong>
        Every {CHECKINS_REQUIRED} gym check‑ins earns a member one reward —
        either a{" "}
        <strong style={{ color: "hsl(20 100% 50%)" }}>
          Free InBody Assessment
        </strong>{" "}
        or a{" "}
        <strong style={{ color: "hsl(20 100% 50%)" }}>
          Bring‑a‑Buddy free session
        </strong>
        . Rewards must be redeemed within{" "}
        <strong style={{ color: "hsl(20 100% 50%)" }}>
          {EXPIRY_DAYS} days
        </strong>{" "}
        of earning. After redemption the cycle resets.
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(["all", "ready", "progress"] as const).map((fv) => (
          <button
            key={fv}
            onClick={() => setFilter(fv)}
            style={{
              padding: "5px 14px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              background:
                filter === fv ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
              color: filter === fv ? "#000" : "hsl(var(--foreground))",
              border: filter === fv ? "none" : "1px solid hsl(var(--border))",
            }}
          >
            {fv === "all"
              ? `All (${members.length})`
              : fv === "ready"
                ? `🎁 Ready (${readyCount})`
                : `⏳ In Progress (${members.length - readyCount})`}
          </button>
        ))}
        <input
          style={{ ...inp, width: 200, marginLeft: "auto" }}
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Btn variant="subtle" size="sm" onClick={load}>
          ↻ Refresh
        </Btn>
      </div>

      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading members…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No members found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((m) => {
            const borderColor = m.rewardReady
              ? m.expired
                ? "hsl(0 84% 51%)"
                : "hsl(142 72% 37%)"
              : "hsl(var(--border))";
            return (
              <div
                key={m.uid}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  padding: "14px 16px",
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      {m.name}
                      {m.rewardReady && !m.expired && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: "hsl(142 72% 37% / 0.15)",
                            color: "hsl(142 72% 37%)",
                          }}
                        >
                          🎁 Reward Ready
                        </span>
                      )}
                      {m.expired && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: "hsl(0 84% 51% / 0.15)",
                            color: "hsl(0 84% 51%)",
                          }}
                        >
                          ⚠ Reward Expired
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--muted-foreground))",
                        marginTop: 2,
                      }}
                    >
                      {m.email} · {m.totalCheckIns} total check-ins
                    </div>
                  </div>
                  {m.rewardReady && !m.expired && (
                    <Btn
                      variant="green"
                      size="sm"
                      onClick={() => setRedeemTarget(m)}
                    >
                      ✓ Redeem Reward
                    </Btn>
                  )}
                </div>
                <div style={{ marginBottom: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      {m.rewardReady
                        ? "Current cycle complete ✓"
                        : `${m.cycleCheckIns} / ${CHECKINS_REQUIRED} check-ins this cycle`}
                    </span>
                    <span style={{ fontWeight: 700 }}>
                      {Math.round(m.pct)}%
                    </span>
                  </div>
                  <ProgressBar pct={m.pct} ready={m.rewardReady} />
                </div>
                {m.rewardReady && !m.expired && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "hsl(38 92% 44%)",
                      marginTop: 6,
                    }}
                  >
                    ⏰ Reward expires{" "}
                    {new Date(m.expiresAt).toLocaleDateString("en-ZA", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                )}
                {m.pendingRewards?.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 10px",
                      background: "hsl(var(--background))",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "hsl(var(--muted-foreground))",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>🔑 Code:</span>
                    <span
                      style={{
                        fontFamily: "monospace",
                        color: "hsl(20 100% 50%)",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {m.pendingRewards[0].redemptionCode}
                    </span>
                  </div>
                )}
                {m.redemptions.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      {m.redemptions.length} previous redemption
                      {m.redemptions.length !== 1 ? "s" : ""}
                    </summary>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      {m.redemptions.slice(0, 5).map((r: any) => (
                        <div
                          key={r.id}
                          style={{
                            fontSize: 11,
                            color: "hsl(var(--muted-foreground))",
                            display: "flex",
                            gap: 8,
                            padding: "4px 8px",
                            background: "hsl(var(--background))",
                            borderRadius: 6,
                          }}
                        >
                          <span>{r.type === "inbody" ? "📊" : "🤝"}</span>
                          <span style={{ color: "hsl(var(--foreground))" }}>
                            {r.type === "inbody"
                              ? "Free InBody Assessment"
                              : "Bring-a-Buddy Session"}
                          </span>
                          <span style={{ marginLeft: "auto" }}>
                            {new Date(r.redeemedAt).toLocaleDateString(
                              "en-ZA",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Redeem modal */}
      {redeemTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setRedeemTarget(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 440,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 22,
                color: "hsl(20 100% 50%)",
                marginBottom: 4,
              }}
            >
              Redeem Reward
            </div>
            <div
              style={{
                fontSize: 13,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 20,
              }}
            >
              {redeemTarget.name} has earned a reward for {CHECKINS_REQUIRED}{" "}
              check-ins.
            </div>
            <label style={lbl}>Reward Type</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {(["inbody", "buddy"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRewardType(t)}
                  style={{
                    flex: 1,
                    padding: "12px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `2px solid ${rewardType === t ? "hsl(20 100% 50%)" : "hsl(var(--border))"}`,
                    background:
                      rewardType === t
                        ? "hsl(20 100% 50% / 0.08)"
                        : "transparent",
                    textAlign: "center",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 4 }}>
                    {t === "inbody" ? "📊" : "🤝"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color:
                        rewardType === t
                          ? "hsl(20 100% 50%)"
                          : "hsl(var(--foreground))",
                    }}
                  >
                    {t === "inbody"
                      ? "Free InBody Assessment"
                      : "Bring-a-Buddy Session"}
                  </div>
                </button>
              ))}
            </div>
            <label style={lbl}>Note (optional)</label>
            <input
              style={{ ...inp, marginBottom: 20 }}
              placeholder="e.g. Redeemed at front desk on 9 Apr"
              value={redeemNote}
              onChange={(e) => setRedeemNote(e.target.value)}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                variant="primary"
                onClick={handleRedeem}
                disabled={submitting}
              >
                {submitting ? "Redeeming…" : "✓ Confirm Redemption"}
              </Btn>
              <Btn variant="subtle" onClick={() => setRedeemTarget(null)}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

const ADMIN_TIER_RULES: Record<
  string,
  { max: number; daily: number; label: string; color: string }
> = {
  u18: { max: 24, daily: 1, label: "Under 18", color: "hsl(263 85% 58%)" },
  hybrid_12m: {
    max: 14,
    daily: 1,
    label: "Hybrid 12-month",
    color: "hsl(217 91% 53%)",
  },
  hybrid_6m: {
    max: 14,
    daily: 1,
    label: "Hybrid 6-month",
    color: "hsl(217 91% 53%)",
  },
  hybrid_m2m: {
    max: 14,
    daily: 1,
    label: "Hybrid M-to-M",
    color: "hsl(217 91% 53%)",
  },
  unlimited_12m: {
    max: 50,
    daily: 2,
    label: "Unlimited 12-month",
    color: "hsl(20 100% 50%)",
  },
  unlimited_6m: {
    max: 50,
    daily: 2,
    label: "Unlimited 6-month",
    color: "hsl(20 100% 50%)",
  },
  unlimited_m2m: {
    max: 50,
    daily: 2,
    label: "Unlimited M-to-M",
    color: "hsl(20 100% 50%)",
  },
  basic: {
    max: 0,
    daily: 0,
    label: "Basic (credits)",
    color: "hsl(var(--muted-foreground))",
  },
};

function getTierRule(tier: string) {
  return ADMIN_TIER_RULES[tier] ?? ADMIN_TIER_RULES.basic;
}

/** Rolling 30-day window start as YYYY-MM-DD */
function thirtyDaysAgoKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

/** Today as YYYY-MM-DD */
function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Usage bar component ───────────────────────────────────────────────────────
function UsageBar({
  used,
  max,
  color,
}: {
  used: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const isWarning = pct >= 80;
  const isFull = pct >= 100;
  return (
    <div
      style={{
        width: "100%",
        height: 6,
        background: "hsl(var(--border))",
        borderRadius: 4,
        overflow: "hidden",
        marginTop: 4,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 4,
          background: isFull
            ? "hsl(0 84% 51%)"
            : isWarning
              ? "hsl(38 92% 44%)"
              : color,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function MonthlyUsageReport({ toast }: any) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "used" | "pct" | "remaining">(
    "pct",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const since = thirtyDaysAgoKey();
  const today = todayKey();

  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "mk2_users"));
      if (!snap.exists()) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const list: any[] = [];
      Object.entries(snap.val()).forEach(([uid, v]: [string, any]) => {
        const tier = v.membership ?? "basic";
        const rules = getTierRule(tier);
        const bookings: any[] = Array.isArray(v.bookings) ? v.bookings : [];

        // Rolling 30-day count — same logic as assertMonthlyLimit
        const used = bookings.filter(
          (b: any) => b.dateKey && b.dateKey >= since && b.dateKey <= today,
        ).length;

        // Today's bookings for daily limit display
        const usedToday = bookings.filter(
          (b: any) => b.dateKey === today,
        ).length;

        // Credits-based members — show credits remaining instead of monthly limit
        const isCredits = rules.max === 0;

        list.push({
          uid,
          name: v.name || "Unnamed",
          email: v.email || "",
          tier,
          rules,
          used,
          usedToday,
          max: rules.max,
          remaining: isCredits
            ? (v.classCredits ?? 0)
            : Math.max(0, rules.max - used),
          pct: isCredits
            ? 0
            : rules.max > 0
              ? Math.min(100, (used / rules.max) * 100)
              : 0,
          isCredits,
          classCredits: v.classCredits ?? 0,
          // Last booking date
          lastBooked:
            bookings.length > 0
              ? bookings.reduce(
                  (latest: string, b: any) =>
                    b.dateKey > latest ? b.dateKey : latest,
                  "",
                )
              : null,
        });
      });

      setMembers(list);
    } catch {
      toast("Failed to load usage data", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const tierGroups = ["all", "u18", "hybrid", "unlimited", "basic"];

  const filtered = members
    .filter((m) => {
      const matchSearch =
        !search ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase());
      const matchTier =
        tierFilter === "all" ||
        (tierFilter === "hybrid" && m.tier.startsWith("hybrid")) ||
        (tierFilter === "unlimited" && m.tier.startsWith("unlimited")) ||
        m.tier === tierFilter;
      return matchSearch && matchTier;
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortBy === "name") diff = a.name.localeCompare(b.name);
      if (sortBy === "used") diff = a.used - b.used;
      if (sortBy === "pct") diff = a.pct - b.pct;
      if (sortBy === "remaining") diff = a.remaining - b.remaining;
      return sortDir === "desc" ? -diff : diff;
    });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const atLimit = members.filter((m) => !m.isCredits && m.pct >= 100).length;
  const nearLimit = members.filter(
    (m) => !m.isCredits && m.pct >= 80 && m.pct < 100,
  ).length;
  const onTrack = members.filter((m) => !m.isCredits && m.pct < 80).length;

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col ? (
      <span style={{ marginLeft: 4, fontSize: 10 }}>
        {sortDir === "desc" ? "▼" : "▲"}
      </span>
    ) : null;

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
        Monthly Usage Report
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        Rolling 30-day window · same calculation as the booking engine
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          {
            label: "At limit",
            val: atLimit,
            color: "hsl(0 84% 51%)",
            accent: atLimit > 0,
          },
          {
            label: "Near limit",
            val: nearLimit,
            color: "hsl(38 92% 44%)",
            accent: nearLimit > 0,
          },
          {
            label: "On track",
            val: onTrack,
            color: "hsl(142 72% 37%)",
            accent: false,
          },
          {
            label: "Total members",
            val: members.length,
            color: "hsl(var(--foreground))",
            accent: false,
          },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: "hsl(var(--secondary))",
              border: `1px solid hsl(var(--border))`,
              borderRadius: 12,
              padding: "14px 18px",
              borderLeft: s.accent ? `3px solid ${s.color}` : undefined,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: s.accent ? s.color : "hsl(var(--foreground))",
                lineHeight: 1,
              }}
            >
              {loading ? "—" : s.val}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginTop: 6,
              }}
            >
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {tierGroups.map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            style={{
              padding: "5px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "capitalize",
              background:
                tierFilter === t ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
              color: tierFilter === t ? "#000" : "hsl(var(--foreground))",
              border:
                tierFilter === t ? "none" : "1px solid hsl(var(--border))",
              fontFamily: "var(--font-body)",
            }}
          >
            {t === "all" ? "All tiers" : t}
          </button>
        ))}
        <input
          style={{ ...inp, width: 180, marginLeft: "auto" }}
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Btn variant="subtle" size="sm" onClick={load}>
          ↻ Refresh
        </Btn>
      </div>

      {/* Sort row */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}
      >
        <span
          style={{
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            alignSelf: "center",
          }}
        >
          Sort by:
        </span>
        {(
          [
            ["name", "Name"],
            ["pct", "% used"],
            ["used", "Classes used"],
            ["remaining", "Remaining"],
          ] as const
        ).map(([col, label]) => (
          <button
            key={col}
            onClick={() => handleSort(col)}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              background:
                sortBy === col ? "hsl(var(--secondary))" : "transparent",
              color:
                sortBy === col
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
              border: "1px solid hsl(var(--border))",
              fontFamily: "var(--font-body)",
            }}
          >
            {label}
            <SortIcon col={col} />
          </button>
        ))}
      </div>

      {/* Member rows */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No members found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m) => {
            const isFull = !m.isCredits && m.pct >= 100;
            const isWarning = !m.isCredits && m.pct >= 80 && !isFull;
            const borderColor = isFull
              ? "hsl(0 84% 51%)"
              : isWarning
                ? "hsl(38 92% 44%)"
                : m.rules.color;

            return (
              <div
                key={m.uid}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 10,
                  padding: "12px 16px",
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  {/* Left: member info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 2,
                      }}
                    >
                      {m.name}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 20,
                          background: `${m.rules.color}20`,
                          color: m.rules.color,
                        }}
                      >
                        {m.rules.label}
                      </span>
                      {isFull && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: "hsl(0 84% 51% / 0.12)",
                            color: "hsl(0 84% 51%)",
                          }}
                        >
                          ⚠ At limit
                        </span>
                      )}
                      {isWarning && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: "hsl(38 92% 44% / 0.12)",
                            color: "hsl(38 92% 44%)",
                          }}
                        >
                          Near limit
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        marginBottom: 8,
                      }}
                    >
                      {m.email}
                      {m.lastBooked && ` · Last booked: ${m.lastBooked}`}
                    </div>

                    {/* Usage bar — only for tiered members */}
                    {!m.isCredits && m.max > 0 && (
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            marginBottom: 2,
                          }}
                        >
                          <span
                            style={{ color: "hsl(var(--muted-foreground))" }}
                          >
                            {m.used} / {m.max} classes this month
                          </span>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isFull
                                ? "hsl(0 84% 51%)"
                                : isWarning
                                  ? "hsl(38 92% 44%)"
                                  : "hsl(var(--foreground))",
                            }}
                          >
                            {Math.round(m.pct)}%
                          </span>
                        </div>
                        <UsageBar
                          used={m.used}
                          max={m.max}
                          color={m.rules.color}
                        />
                      </>
                    )}

                    {/* Credits-based members */}
                    {m.isCredits && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        🎟 {m.classCredits} credits remaining · pay-per-class
                      </div>
                    )}
                  </div>

                  {/* Right: stats */}
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexShrink: 0,
                      flexWrap: "wrap",
                    }}
                  >
                    {!m.isCredits && (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: "hsl(20 100% 50%)",
                            }}
                          >
                            {m.used}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            Used
                          </div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color:
                                m.remaining === 0
                                  ? "hsl(0 84% 51%)"
                                  : "hsl(142 72% 37%)",
                            }}
                          >
                            {m.remaining}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            Left
                          </div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>
                            {m.usedToday}/{m.rules.daily}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            Today
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          marginTop: 20,
          padding: "12px 16px",
          background: "hsl(var(--secondary))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 10,
          fontSize: 11,
          color: "hsl(var(--muted-foreground))",
          lineHeight: 1.9,
        }}
      >
        <strong style={{ color: "hsl(var(--foreground))" }}>
          Tier limits (rolling 30 days):
        </strong>
        <br />
        🟣 Under 18 — 24 classes · CrossFit only · 1/day
        <br />
        🔵 Hybrid — 14 classes · all except Open Gym · 1/day
        <br />
        🟠 Unlimited — 50 classes · all classes · 2/day
        <br />⚫ Basic — credits only, no monthly limit
      </div>
    </div>
  );
}

// ── AdsManager — paste into Admin.tsx above the NAV_GROUPS constant ──────────
function AdsManager({
  toast,
}: {
  toast: (msg: string, type?: string) => void;
}) {
  const blank = {
    bizName: "",
    headline: "",
    tagline: "",
    link: "",
    imageUrl: "",
    startDate: "",
    expiryDate: "",
    status: "draft" as "draft" | "published",
  };

  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(blank);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState<
    "all" | "published" | "draft" | "expired"
  >("all");
  const fileRef = useRef<HTMLInputElement>(null);

  const f = (k: string) => (e: any) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isExpired(ad: any) {
    if (!ad.expiryDate) return false;
    return new Date(ad.expiryDate).getTime() < Date.now();
  }

  function adStatus(ad: any) {
    if (isExpired(ad)) return "expired";
    return ad.status ?? "draft";
  }

  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    published: { bg: "hsl(142 72% 37% / 0.12)", color: "hsl(142 72% 37%)" },
    draft: { bg: "hsl(38 92% 44% / 0.12)", color: "hsl(38 92% 44%)" },
    expired: { bg: "hsl(0 0% 50% / 0.12)", color: "hsl(0 0% 55%)" },
  };

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const snap = await get(ref(db, "dashboard_ads"));
      if (snap.exists()) {
        const list = Object.entries(snap.val()).map(
          ([k, v]: [string, any]) => ({
            id: k,
            ...v,
          }),
        );
        setAds(list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
      } else {
        setAds([]);
      }
    } catch {
      toast("Failed to load ads", "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return toast("Image files only", "error");
    if (file.size > 5 * 1024 * 1024) return toast("Max 5 MB", "error");

    setUploading(true);
    setUploadProgress(0);
    try {
      const storage = getStorage();
      const path = `ads/${Date.now()}_${file.name.replace(/\s/g, "_")}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      task.on(
        "state_changed",
        (s) =>
          setUploadProgress(
            Math.round((s.bytesTransferred / s.totalBytes) * 100),
          ),
        () => {
          toast("Upload failed", "error");
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setForm((p) => ({ ...p, imageUrl: url }));
          toast("Image uploaded ✓", "success");
          setUploading(false);
        },
      );
    } catch {
      toast("Upload error", "error");
      setUploading(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = async (status: "published" | "draft") => {
    if (!form.bizName || !form.headline) {
      return toast("Business name and headline are required", "error");
    }
    if (status === "published" && !form.expiryDate) {
      return toast("Set an expiry date before publishing", "error");
    }
    const payload = { ...form, status, createdAt: Date.now() };
    try {
      if (editing) {
        await set(ref(db, `dashboard_ads/${editing.id}`), payload);
        toast("Ad updated ✓", "success");
      } else {
        const newRef = push(ref(db, "dashboard_ads"));
        await set(newRef, payload);
        toast(
          status === "published" ? "Ad published ✓" : "Draft saved ✓",
          "success",
        );
      }
      setShowForm(false);
      setEditing(null);
      setForm(blank);
      load();
    } catch {
      toast("Save failed", "error");
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const del = async (id: string) => {
    if (!confirm("Delete this ad permanently?")) return;
    await remove(ref(db, `dashboard_ads/${id}`));
    setAds((prev) => prev.filter((a) => a.id !== id));
    toast("Deleted", "info");
  };

  // ── Toggle publish/pause ───────────────────────────────────────────────────
  const togglePublish = async (ad: any) => {
    if (ad.status === "published") {
      await set(ref(db, `dashboard_ads/${ad.id}/status`), "draft");
      toast("Ad paused", "info");
    } else {
      if (!ad.expiryDate)
        return toast("Set expiry date before publishing", "error");
      await set(ref(db, `dashboard_ads/${ad.id}/status`), "published");
      toast("Ad published ✓", "success");
    }
    load();
  };

  // ── Start edit ─────────────────────────────────────────────────────────────
  const startEdit = (ad: any) => {
    setEditing(ad);
    setForm({
      bizName: ad.bizName ?? "",
      headline: ad.headline ?? "",
      tagline: ad.tagline ?? "",
      link: ad.link ?? "",
      imageUrl: ad.imageUrl ?? "",
      startDate: ad.startDate ?? "",
      expiryDate: ad.expiryDate ?? "",
      status: ad.status ?? "draft",
    });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditing(null);
    setForm(blank);
  };

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered =
    filter === "all" ? ads : ads.filter((a) => adStatus(a) === filter);

  // ── Mini preview (what it looks like on the dashboard) ────────────────────
  const AdPreview = ({ ad }: { ad: any }) => (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid hsl(var(--border))",
        background: "hsl(var(--card))",
        position: "relative",
        minHeight: 72,
      }}
    >
      {ad.imageUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${ad.imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: 0.15,
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            padding: "2px 6px",
            borderRadius: 6,
            background: "hsl(38 92% 50% / 0.15)",
            color: "hsl(38 92% 50%)",
            border: "1px solid hsl(38 92% 50% / 0.3)",
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}
        >
          AD
        </span>
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt=""
            style={{
              width: 40,
              height: 40,
              objectFit: "cover",
              borderRadius: 6,
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: "hsl(var(--foreground))",
            }}
          >
            {ad.headline || ad.bizName || "—"}
          </div>
          {ad.tagline && (
            <div
              style={{
                fontSize: 11,
                color: "hsl(var(--muted-foreground))",
                marginTop: 2,
              }}
            >
              {ad.tagline}
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 8,
            background: "hsl(20 100% 50%)",
            color: "#000",
            flexShrink: 0,
          }}
        >
          Learn More
        </div>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Dashboard Ads ({ads.length})
          </div>
          <div
            style={{
              fontSize: 11,
              color: "hsl(var(--muted-foreground))",
              marginTop: 3,
            }}
          >
            Shown once per session · auto-dismissed after 8 seconds
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["all", "published", "draft", "expired"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "capitalize",
                background:
                  filter === s ? "hsl(20 100% 50%)" : "hsl(var(--secondary))",
                color: filter === s ? "#000" : "hsl(var(--foreground))",
                border: filter === s ? "none" : "1px solid hsl(var(--border))",
                fontFamily: "var(--font-body)",
              }}
            >
              {s}
            </button>
          ))}
          <Btn variant="subtle" size="sm" onClick={load}>
            ↻ Refresh
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            onClick={() => (showForm ? cancel() : setShowForm(true))}
          >
            {showForm ? "✕ Cancel" : "+ New Ad"}
          </Btn>
        </div>
      </div>

      {/* How it works */}
      <div
        style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 10,
          background: "hsl(175 80% 44% / 0.07)",
          border: "1px solid hsl(175 80% 44% / 0.2)",
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          lineHeight: 1.6,
        }}
      >
        💡{" "}
        <strong style={{ color: "hsl(var(--foreground))" }}>
          How ads work:
        </strong>{" "}
        The most recently created published ad is shown once per user per
        session at the top of their dashboard. It auto-dismisses after{" "}
        <strong style={{ color: "hsl(var(--foreground))" }}>8 seconds</strong>{" "}
        with a countdown timer. Ads stop showing after their expiry date.
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              {editing ? "✏️ Edit Ad" : "➕ New Ad"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={lbl}>Business Name *</label>
                <input
                  style={inp}
                  placeholder="e.g. Kinetic Sports"
                  value={form.bizName}
                  onChange={f("bizName")}
                />
              </div>
              <div>
                <label style={lbl}>Headline *</label>
                <input
                  style={inp}
                  placeholder="e.g. 20% off this month"
                  value={form.headline}
                  onChange={f("headline")}
                />
              </div>
              <div>
                <label style={lbl}>Tagline</label>
                <input
                  style={inp}
                  placeholder="Short supporting text"
                  value={form.tagline}
                  onChange={f("tagline")}
                />
              </div>
              <div>
                <label style={lbl}>CTA Link</label>
                <input
                  style={inp}
                  placeholder="https://..."
                  value={form.link}
                  onChange={f("link")}
                />
              </div>
              <div>
                <label style={lbl}>Start Date</label>
                <input
                  style={inp}
                  type="date"
                  value={form.startDate}
                  onChange={f("startDate")}
                />
              </div>
              <div>
                <label style={lbl}>Expiry Date *</label>
                <input
                  style={inp}
                  type="date"
                  value={form.expiryDate}
                  onChange={f("expiryDate")}
                />
              </div>
            </div>

            {/* Image upload */}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Ad Image (optional)</label>
              {form.imageUrl ? (
                <div style={{ position: "relative", width: "fit-content" }}>
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    style={{
                      width: 200,
                      height: 100,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                  <button
                    onClick={() => setForm((p) => ({ ...p, imageUrl: "" }))}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "50%",
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleFile}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px dashed hsl(var(--border))",
                      background: "hsl(var(--card))",
                      cursor: uploading ? "not-allowed" : "pointer",
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    {uploading
                      ? `Uploading… ${uploadProgress}%`
                      : "📁 Upload image (max 5MB)"}
                  </button>
                  {uploading && (
                    <div
                      style={{
                        marginTop: 8,
                        height: 4,
                        background: "hsl(var(--border))",
                        borderRadius: 2,
                        overflow: "hidden",
                        width: 200,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${uploadProgress}%`,
                          background: "hsl(20 100% 50%)",
                          borderRadius: 2,
                          transition: "width 0.2s",
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Live preview */}
            {(form.headline || form.bizName) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Dashboard Preview</div>
                <AdPreview ad={form} />
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn
                variant="primary"
                onClick={() => save("published")}
                disabled={uploading}
              >
                🚀 Publish
              </Btn>
              <Btn
                variant="subtle"
                onClick={() => save("draft")}
                disabled={uploading}
              >
                💾 Save Draft
              </Btn>
              <Btn variant="ghost" onClick={cancel}>
                Cancel
              </Btn>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ads list */}
      {loading ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>
          No ads found.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((ad) => {
            const status = adStatus(ad);
            const sc = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
            return (
              <div
                key={ad.id}
                style={{
                  background: "hsl(var(--secondary))",
                  border: "1px solid hsl(var(--border))",
                  borderLeft: `3px solid ${sc.color}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    {ad.imageUrl && (
                      <img
                        src={ad.imageUrl}
                        alt=""
                        style={{
                          width: 52,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 6,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        {ad.bizName}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: sc.bg,
                            color: sc.color,
                            textTransform: "capitalize",
                          }}
                        >
                          {status}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          marginTop: 3,
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        {ad.headline}
                        {ad.tagline && (
                          <span
                            style={{
                              color: "hsl(var(--muted-foreground))",
                              marginLeft: 6,
                            }}
                          >
                            — {ad.tagline}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--muted-foreground))",
                          marginTop: 4,
                        }}
                      >
                        {ad.startDate && `From ${ad.startDate}`}
                        {ad.startDate && ad.expiryDate && " · "}
                        {ad.expiryDate && `Expires ${ad.expiryDate}`}
                        {isExpired(ad) && (
                          <span
                            style={{
                              color: "hsl(0 84% 51%)",
                              marginLeft: 6,
                              fontWeight: 700,
                            }}
                          >
                            ✕ Expired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!isExpired(ad) && (
                      <Btn
                        variant={ad.status === "published" ? "subtle" : "green"}
                        size="sm"
                        onClick={() => togglePublish(ad)}
                      >
                        {ad.status === "published" ? "⏸ Pause" : "🚀 Publish"}
                      </Btn>
                    )}
                    <Btn
                      variant="subtle"
                      size="sm"
                      onClick={() => startEdit(ad)}
                    >
                      ✏️ Edit
                    </Btn>
                    <Btn variant="danger" size="sm" onClick={() => del(ad.id)}>
                      Delete
                    </Btn>
                  </div>
                </div>

                {/* Mini dashboard preview */}
                <AdPreview ad={ad} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPLACE everything from the TABS constant to the end of the file with this.
// All manager components above (MembersManager, ClassesManager, etc.) are
// completely untouched — paste this below the last closing brace of
// ManualCheckInManager (or whichever component is last before TABS).
// ─────────────────────────────────────────────────────────────────────────────

// ── Sidebar nav config ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard" },
    ],
  },
  {
    label: "Members",
    items: [
      { id: "members", icon: "ti-users", label: "Membership Tiers" },
      { id: "app_members", icon: "ti-app-window", label: "App Members" },
      { id: "deletions", icon: "ti-trash", label: "Deletion Requests" },
      { id: "checkin", icon: "ti-circle-check", label: "Check-In" },
      { id: "coupons", icon: "ti-ticket", label: "Coupons" },
      { id: "rewards", icon: "ti-gift", label: "Rewards" },
      { id: "usage", icon: "ti-chart-bar", label: "Monthly Usage" },
      { id: "credits", icon: "ti-ticket", label: "Packages" },
    ],
  },
  {
    label: "Classes",
    items: [
      { id: "classes", icon: "ti-calendar", label: "Schedule" },
      { id: "exports", icon: "ti-download", label: "Exports" },
      { id: "pending", icon: "ti-clock-hour-4", label: "Pending Payments" },
      { id: "cashbooking", icon: "ti-cash", label: "Cash Booking" },
      { id: "challenges", icon: "ti-trophy", label: "Challenges" },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "news", icon: "ti-news", label: "News & Events" },
      { id: "gallery", icon: "ti-brand-instagram", label: "Social Media" },
      { id: "banners", icon: "ti-ad", label: "Ad Banners" },
      { id: "dashboard_ads", icon: "ti-speakerphone", label: "Dashboard Ads" },
    ],
  },
  {
    label: "Admin",
    items: [
      { id: "community", icon: "ti-message-circle", label: "Community" },
      { id: "ads", icon: "ti-speakerphone", label: "Ad Enquiries" },
      { id: "feedback", icon: "ti-message-dots", label: "Feedback" },
      { id: "notifications", icon: "ti-bell", label: "Notifications" },
      { id: "push", icon: "ti-device-mobile", label: "Push Notifications" },
      { id: "terms", icon: "ti-file-text", label: "T&C Records" },
      { id: "revenue", icon: "ti-report-money", label: "Revenue" },
      { id: "instagram", icon: "ti-plug", label: "Instagram" },
    ],
  },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({
  onNavigate,
  toast,
}: {
  onNavigate: (id: string) => void;
  toast: any;
}) {
  const [stats, setStats] = useState({
    members: 0,
    classesToday: 0,
    rewardsReady: 0,
    newEnquiries: 0,
    pendingNews: 0,
    activeChallenges: 0,
  });
  const [todaysClasses, setTodaysClasses] = useState<any[]>([]);
  const [rewardMembers, setRewardMembers] = useState<any[]>([]);
  const [recentEnquiries, setRecentEnquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Members
        const membersSnap = await get(ref(db, "mk2_users"));
        let memberCount = 0;
        let rewardsReady = 0;
        const rewardList: any[] = [];
        if (membersSnap.exists()) {
          Object.entries(membersSnap.val()).forEach(
            ([uid, val]: [string, any]) => {
              memberCount++;
              const checkIns = Array.isArray(val.checkIns)
                ? val.checkIns.length
                : 0;
              const rewardsMap: Record<string, any> = val.rewards ?? {};
              const pending = Object.entries(rewardsMap).filter(
                ([, r]: [string, any]) =>
                  r.status === "pending" && Date.now() < r.expiresAt,
              );
              if (pending.length > 0) {
                rewardsReady++;
                rewardList.push({
                  name: val.name || "Unnamed",
                  email: val.email || "",
                  checkIns,
                  expiresAt: (pending[0][1] as any).expiresAt,
                });
              }
            },
          );
        }

        // Today's classes
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayKey = formatDateKey(today);
        const todayName = getDayName(today);
        const classesSnap = await get(ref(db, "admin_classes"));
        let classesToday: any[] = [];
        if (classesSnap.exists()) {
          Object.entries(classesSnap.val()).forEach(
            ([id, val]: [string, any]) => {
              const matches =
                val.scheduleType === "date"
                  ? val.specificDate === todayKey
                  : val.day === todayName;
              if (matches) classesToday.push({ id, ...val });
            },
          );
          classesToday.sort((a, b) =>
            (a.time || "").localeCompare(b.time || ""),
          );
        }

        // Ad enquiries
        const enquiriesSnap = await get(ref(db, "ad_enquiries"));
        let newEnqs = 0;
        const enqList: any[] = [];
        if (enquiriesSnap.exists()) {
          Object.entries(enquiriesSnap.val()).forEach(
            ([k, v]: [string, any]) => {
              if (v.status === "new") newEnqs++;
              enqList.push({ key: k, ...v });
            },
          );
          enqList.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          );
        }

        // News drafts
        const newsSnap = await get(ref(db, "admin_news"));
        let pendingNews = 0;
        if (newsSnap.exists()) {
          Object.values(newsSnap.val()).forEach((v: any) => {
            if (v.status === "draft") pendingNews++;
          });
        }

        // Active challenges
        const challSnap = await get(ref(db, "challenges"));
        let activeChallenges = 0;
        if (challSnap.exists()) {
          Object.values(challSnap.val()).forEach((v: any) => {
            if (v.active) activeChallenges++;
          });
        }

        setStats({
          members: memberCount,
          classesToday: classesToday.length,
          rewardsReady,
          newEnquiries: newEnqs,
          pendingNews,
          activeChallenges,
        });
        setTodaysClasses(classesToday.slice(0, 4));
        setRewardMembers(rewardList.slice(0, 4));
        setRecentEnquiries(enqList.slice(0, 3));
      } catch {
        toast("Dashboard load error", "error");
      }
      setLoading(false);
    };
    load();
  }, []);

  const s: any = {
    card: {
      background: "hsl(var(--secondary))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 12,
      padding: "14px 18px",
    },
    cardTitle: {
      fontSize: 11,
      fontWeight: 700,
      textTransform: "uppercase" as const,
      letterSpacing: "0.1em",
      color: "hsl(var(--muted-foreground))",
      marginBottom: 12,
    },
    row: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "7px 0",
      borderBottom: "1px solid hsl(var(--border))",
    },
    rowLast: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "7px 0",
    },
    name: { fontWeight: 700, fontSize: 13 },
    sub: { fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 },
  };

  const StatCard = ({ val, label, accent, onClick }: any) => (
    <div
      onClick={onClick}
      style={{
        ...s.card,
        cursor: onClick ? "pointer" : "default",
        borderLeft: accent ? "3px solid hsl(20 100% 50%)" : undefined,
        transition: "background 0.15s",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ? "hsl(20 100% 50%)" : "hsl(var(--foreground))",
          lineHeight: 1,
        }}
      >
        {loading ? "—" : val}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "hsl(var(--muted-foreground))",
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );

  const Badge = ({ children, color }: any) => (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 20,
        background:
          color === "green"
            ? "hsl(142 72% 37% / 0.15)"
            : color === "amber"
              ? "hsl(38 92% 44% / 0.15)"
              : "hsl(20 100% 50% / 0.15)",
        color:
          color === "green"
            ? "hsl(142 72% 37%)"
            : color === "amber"
              ? "hsl(38 92% 44%)"
              : "hsl(20 100% 50%)",
      }}
    >
      {children}
    </span>
  );

  const now = new Date();

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        Good{" "}
        {now.getHours() < 12
          ? "morning"
          : now.getHours() < 17
            ? "afternoon"
            : "evening"}{" "}
        👋
      </div>
      <div
        style={{
          fontSize: 12,
          color: "hsl(var(--muted-foreground))",
          marginBottom: 20,
        }}
      >
        {now.toLocaleDateString("en-ZA", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>

      {/* Stat grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatCard
          val={stats.members}
          label="App users"
          onClick={() => onNavigate("members")}
        />
        <StatCard
          val={stats.classesToday}
          label="Classes today"
          onClick={() => onNavigate("classes")}
        />
        <StatCard
          val={stats.rewardsReady}
          label="Rewards ready"
          accent
          onClick={() => onNavigate("rewards")}
        />
        <StatCard
          val={stats.newEnquiries}
          label="New enquiries"
          accent={stats.newEnquiries > 0}
          onClick={() => onNavigate("ads")}
        />
        <StatCard
          val={stats.pendingNews}
          label="News drafts"
          onClick={() => onNavigate("news")}
        />
        <StatCard
          val={stats.activeChallenges}
          label="Active challenges"
          onClick={() => onNavigate("challenges")}
        />
      </div>

      {/* Three panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {/* Today's classes */}
        <div style={s.card}>
          <div style={s.cardTitle}>📅 Today's classes</div>
          {loading ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              Loading…
            </div>
          ) : todaysClasses.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              No classes today.
            </div>
          ) : (
            todaysClasses.map((cls, i) => {
              const isLast = i === todaysClasses.length - 1;
              const clsTime = cls.time || "";
              const [hh, mm] = clsTime.split(":").map(Number);
              const clsDate = new Date();
              clsDate.setHours(hh, mm, 0, 0);
              const done = clsDate < now;
              return (
                <div key={cls.id} style={isLast ? s.rowLast : s.row}>
                  <div>
                    <div style={s.name}>
                      {cls.name}{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        · {cls.time}
                      </span>
                    </div>
                    <div style={s.sub}>
                      {cls.trainer} · {cls.bookedCount ?? 0}/{cls.spots} booked
                    </div>
                  </div>
                  <Badge color={done ? "amber" : "green"}>
                    {done ? "Done" : "Active"}
                  </Badge>
                </div>
              );
            })
          )}
          {!loading && (
            <button
              onClick={() => onNavigate("classes")}
              style={{
                marginTop: 12,
                fontSize: 11,
                fontWeight: 700,
                color: "hsl(20 100% 50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              View schedule →
            </button>
          )}
        </div>

        {/* Rewards ready */}
        <div style={s.card}>
          <div style={s.cardTitle}>🎁 Rewards ready to redeem</div>
          {loading ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              Loading…
            </div>
          ) : rewardMembers.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              No pending rewards.
            </div>
          ) : (
            rewardMembers.map((m, i) => {
              const isLast = i === rewardMembers.length - 1;
              const daysLeft = Math.max(
                0,
                Math.round((m.expiresAt - Date.now()) / 86400000),
              );
              return (
                <div key={m.email} style={isLast ? s.rowLast : s.row}>
                  <div>
                    <div style={s.name}>{m.name}</div>
                    <div style={s.sub}>
                      Expires in {daysLeft}d · {m.checkIns} check-ins
                    </div>
                  </div>
                  <Badge color={daysLeft < 7 ? "orange" : "green"}>
                    Redeem
                  </Badge>
                </div>
              );
            })
          )}
          {!loading && (
            <button
              onClick={() => onNavigate("rewards")}
              style={{
                marginTop: 12,
                fontSize: 11,
                fontWeight: 700,
                color: "hsl(20 100% 50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Manage rewards →
            </button>
          )}
        </div>

        {/* Ad enquiries */}
        <div style={s.card}>
          <div style={s.cardTitle}>📣 Recent ad enquiries</div>
          {loading ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              Loading…
            </div>
          ) : recentEnquiries.length === 0 ? (
            <div
              style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
            >
              No enquiries yet.
            </div>
          ) : (
            recentEnquiries.map((e, i) => {
              const isLast = i === recentEnquiries.length - 1;
              return (
                <div key={e.key} style={isLast ? s.rowLast : s.row}>
                  <div>
                    <div style={s.name}>{e.bizName}</div>
                    <div style={s.sub}>
                      {e.contactName} ·{" "}
                      {new Date(e.timestamp).toLocaleDateString("en-ZA")}
                    </div>
                  </div>
                  <Badge
                    color={
                      e.status === "new"
                        ? "orange"
                        : e.status === "confirmed"
                          ? "green"
                          : "amber"
                    }
                  >
                    {e.status}
                  </Badge>
                </div>
              );
            })
          )}
          {!loading && (
            <button
              onClick={() => onNavigate("ads")}
              style={{
                marginTop: 12,
                fontSize: 11,
                fontWeight: 700,
                color: "hsl(20 100% 50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              View all enquiries →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar item ──────────────────────────────────────────────────────────────
function SidebarItem({ item, active, onClick, badge }: any) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        margin: "1px 0",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        background: active ? "hsl(20 100% 50% / 0.12)" : "transparent",
        color: active ? "hsl(20 100% 50%)" : "hsl(var(--muted-foreground))",
        textAlign: "left",
        transition: "all 0.12s",
      }}
    >
      <i
        className={`ti ${item.icon}`}
        style={{ fontSize: 16, width: 18, textAlign: "center", flexShrink: 0 }}
        aria-hidden="true"
      />
      <span
        style={{
          flex: 1,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {item.label}
      </span>
      {badge > 0 && (
        <span
          style={{
            background: "hsl(20 100% 50%)",
            color: "#000",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 10,
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Main Admin export ─────────────────────────────────────────────────────────
export function Admin() {
  const SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours

  const [authed, setAuthed] = useState(() => {
    const isAuthed = sessionStorage.getItem("mk2admin") === "true";
    const loginTime = parseInt(sessionStorage.getItem("mk2admin_time") ?? "0");
    if (isAuthed && Date.now() - loginTime > SESSION_DURATION) {
      sessionStorage.removeItem("mk2admin");
      sessionStorage.removeItem("mk2admin_time");
      return false;
    }
    return isAuthed;
  });
  const [tab, setTab] = useState("dashboard");
  const [toastQ, setToastQ] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isMobile } = useBreakpoint();

  // Live badge counts
  const [rewardsCount, setRewardsCount] = useState(0);
  const [enquiriesCount, setEnquiriesCount] = useState(0);

  useEffect(() => {
    if (!authed) return;
    // Rewards badge
    get(ref(db, "mk2_users")).then((snap) => {
      if (!snap.exists()) return;
      let count = 0;
      Object.values(snap.val()).forEach((val: any) => {
        const rewardsMap: Record<string, any> = val.rewards ?? {};
        const pending = Object.values(rewardsMap).filter(
          (r: any) => r.status === "pending" && Date.now() < r.expiresAt,
        );
        if (pending.length > 0) count++;
      });
      setRewardsCount(count);
    });
    // Enquiries badge
    get(ref(db, "ad_enquiries")).then((snap) => {
      if (!snap.exists()) return;
      const count = Object.values(snap.val()).filter(
        (v: any) => v.status === "new",
      ).length;
      setEnquiriesCount(count);
    });
  }, [authed]);

  const toast = (msg: string, type: string) => setToastQ({ msg, type });

  const login = () => {
    sessionStorage.setItem("mk2admin", "true");
    sessionStorage.setItem("mk2admin_time", Date.now().toString());
    setAuthed(true);
  };
  const logout = () => {
    sessionStorage.removeItem("mk2admin");
    setAuthed(false);
  };

  if (!authed) return <AdminLogin onLogin={login} />;

  const getBadge = (id: string) => {
    if (id === "rewards") return rewardsCount;
    if (id === "ads") return enquiriesCount;
    return 0;
  };

  const activeLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === tab)?.label ??
    "Dashboard";

  const Sidebar = () => (
    <div
      style={{
        width: 220,
        background: "hsl(var(--card))",
        borderRight: "1px solid hsl(var(--border))",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            letterSpacing: "0.15em",
            color: "hsl(20 100% 50%)",
          }}
        >
          MK2R
        </div>
        <div
          style={{
            fontSize: 10,
            color: "hsl(var(--muted-foreground))",
            marginTop: 2,
          }}
        >
          Admin portal
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "hsl(var(--muted-foreground))",
                padding: "10px 12px 4px",
                opacity: 0.6,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                active={tab === item.id}
                badge={getBadge(item.id)}
                onClick={() => {
                  setTab(item.id);
                  setSidebarOpen(false);
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Sign out */}
      <div
        style={{
          padding: "10px 8px",
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <div
          style={{
            padding: "6px 12px 2px",
            fontSize: 10,
            color: "hsl(var(--muted-foreground))",
            opacity: 0.5,
            fontFamily: "var(--font-body)",
          }}
        >
          v1.0.0 · MK2R Admin
        </div>
        <SidebarItem
          item={{ id: "signout", icon: "ti-logout", label: "Sign out" }}
          active={false}
          onClick={logout}
        />
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Desktop sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}
          onClick={() => setSidebarOpen(false)}
        >
          <div
            style={{ width: "min(220px, 75vw)", height: "100%", zIndex: 201 }}
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar />
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} />
        </div>
      )}

      {/* Main area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 54,
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            gap: 12,
            flexShrink: 0,
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "hsl(var(--foreground))",
                fontSize: 20,
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
              aria-label="Open menu"
            >
              <i className="ti ti-menu-2" aria-hidden="true" />
            </button>
          )}
          <div style={{ fontWeight: 700, fontSize: 15 }}>{activeLabel}</div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            {isMobile && tab !== "dashboard" && (
              <button
                onClick={() => setTab("dashboard")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--foreground))",
                  fontSize: 20,
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Back to dashboard"
              >
                <i className="ti ti-arrow-left" aria-hidden="true" />
              </button>
            )}
            {/* Hide verbose pills on mobile — badges on sidebar items are enough */}
            {!isMobile && rewardsCount > 0 && (
              <button
                onClick={() => setTab("rewards")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 20,
                  background: "hsl(142 72% 37% / 0.12)",
                  border: "1px solid hsl(142 72% 37% / 0.3)",
                  color: "hsl(142 72% 37%)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                🎁 {rewardsCount} reward{rewardsCount !== 1 ? "s" : ""} ready
              </button>
            )}
            {!isMobile && enquiriesCount > 0 && (
              <button
                onClick={() => setTab("ads")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 20,
                  background: "hsl(20 100% 50% / 0.1)",
                  border: "1px solid hsl(20 100% 50% / 0.3)",
                  color: "hsl(20 100% 50%)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                📣 {enquiriesCount} new enquir
                {enquiriesCount !== 1 ? "ies" : "y"}
              </button>
            )}
          </div>
        </div>

        {/* Page content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "16px 14px" : "28px 28px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === "dashboard" && (
                <Dashboard onNavigate={setTab} toast={toast} />
              )}
              {tab === "members" && <MembersManager toast={toast} />}
              {tab === "deletions" && <DeletionRequestManager toast={toast} />}
              {tab === "app_members" && <AppMembersManager toast={toast} />}
              {tab === "checkin" && <ManualCheckInManager toast={toast} />}
              {tab === "coupons" && <CouponsManager toast={toast} />}
              {tab === "rewards" && <RewardsManager toast={toast} />}
              {tab === "credits" && <PackagesManager toast={toast} />}
              {tab === "classes" && <ClassesManager toast={toast} />}
              {tab === "pending" && <PendingPaymentsManager toast={toast} />}
              {tab === "exports" && <BookingExports toast={toast} />}
              {tab === "challenges" && <ChallengesManager toast={toast} />}
              {tab === "news" && <NewsManager toast={toast} />}
              {tab === "gallery" && <SocialMediaManager toast={toast} />}
              {tab === "banners" && <BannersManager toast={toast} />}
              {tab === "dashboard_ads" && <AdsManager toast={toast} />}
              {tab === "community" && <CommunityManager toast={toast} />}
              {tab === "usage" && <MonthlyUsageReport toast={toast} />}
              {tab === "ads" && <AdEnquiriesManager toast={toast} />}
              {tab === "cashbooking" && <ManualCashBooking toast={toast} />}
              {tab === "feedback" && <FeedbackManager toast={toast} />}
              {tab === "revenue" && <RevenueManager toast={toast} />}
              {tab === "notifications" && (
                <NotificationsManager toast={toast} />
              )}
              {tab === "push" && <PushNotificationsManager toast={toast} />}
              {tab === "terms" && <TermsManager toast={toast} />}
              {tab === "instagram" && <InstagramSetup />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {toastQ && <MToast {...toastQ} onDone={() => setToastQ(null)} />}
    </div>
  );
}
