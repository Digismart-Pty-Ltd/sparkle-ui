import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { sendEmailVerification } from "firebase/auth";
import { ref, onValue } from "firebase/database";

function MI({ icon, size = 20 }: { icon: string; size?: number }) {
  return (
    <span
      className="material-symbols-rounded"
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {icon}
    </span>
  );
}

// ─── UPDATED: Include all membership tiers ──────────────────────────────
const MEMBERSHIP_CONFIG: Record<
  string,
  { label: string; color: string; emoji: string }
> = {
  basic: { label: "Basic", color: "#9ca3af", emoji: "🔵" },
  silver: { label: "Silver", color: "#e2e8f0", emoji: "⚪" },
  gold: { label: "Gold", color: "hsl(38 92% 50%)", emoji: "🥇" },
  u18: { label: "Under 18", color: "hsl(263 85% 58%)", emoji: "🟣" },
  hybrid_12m: {
    label: "Hybrid 12-month",
    color: "hsl(217 91% 53%)",
    emoji: "🔵",
  },
  hybrid_6m: {
    label: "Hybrid 6-month",
    color: "hsl(217 91% 53%)",
    emoji: "🔵",
  },
  hybrid_m2m: {
    label: "Hybrid M-to-M",
    color: "hsl(217 91% 53%)",
    emoji: "🔵",
  },
  unlimited_12m: {
    label: "Unlimited 12-month",
    color: "hsl(20 100% 50%)",
    emoji: "🟠",
  },
  unlimited_6m: {
    label: "Unlimited 6-month",
    color: "hsl(20 100% 50%)",
    emoji: "🟠",
  },
  unlimited_m2m: {
    label: "Unlimited M-to-M",
    color: "hsl(20 100% 50%)",
    emoji: "🟠",
  },
};

const NEWS_PREVIEW = [
  {
    tag: "EVENT",
    title: "30-Day Transformation Challenge",
    date: "1 Apr 2026",
    accent: "orange" as const,
    imageUrl: "",
  },
  {
    tag: "NEWS",
    title: "New CrossFit Equipment Arrived",
    date: "20 Mar 2026",
    accent: "teal" as const,
    imageUrl: "",
  },
  {
    tag: "EVENT",
    title: "Charity Fun Run — 5km & 10km",
    date: "12 Apr 2026",
    accent: "orange" as const,
    imageUrl: "",
  },
];

const CHECKIN_MILESTONE = 40;

export function getRewardStatus(checkIns: any[], rewards: Record<string, any>) {
  const total = checkIns.length;
  const milestonesEarned = Math.floor(total / CHECKIN_MILESTONE);
  const rewardsRedeemed = Object.values(rewards ?? {}).filter(
    (r) => r.status === "redeemed",
  ).length;
  const rewardsPending = Object.values(rewards ?? {}).filter(
    (r) => r.status === "pending",
  );
  const nextMilestoneAt = (milestonesEarned + 1) * CHECKIN_MILESTONE;
  const progressToNext = total % CHECKIN_MILESTONE;
  return {
    total,
    milestonesEarned,
    rewardsRedeemed,
    rewardsPending,
    nextMilestoneAt,
    progressToNext,
    pct: Math.round((progressToNext / CHECKIN_MILESTONE) * 100),
  };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

// ── Ad Banner (premium version, session-limited, expiry-aware) ──────────────
function AdBanner({ ad, onDismiss }: { ad: any; onDismiss: () => void }) {
  const [timeLeft, setTimeLeft] = useState(8);

  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl mb-6"
      style={{
        background: ad.imageUrl
          ? "hsl(var(--card))"
          : "linear-gradient(135deg, hsl(38 92% 50% / 0.10) 0%, hsl(20 100% 50% / 0.08) 100%)",
        border: "1px solid hsl(38 92% 50% / 0.35)",
        boxShadow: "0 4px 24px -6px hsl(38 92% 50% / 0.20)",
      }}
    >
      {/* Full bleed background image with scrim */}
      {ad.imageUrl && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${ad.imageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.22,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, hsl(var(--card) / 0.92) 0%, hsl(var(--card) / 0.60) 100%)",
            }}
          />
        </>
      )}

      {/* Gold accent top bar */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: 3,
          background:
            "linear-gradient(90deg, hsl(38 92% 50%) 0%, hsl(20 100% 50%) 100%)",
        }}
      />

      {/* Main content */}
      <div className="relative flex items-center gap-3 px-4 pt-4 pb-3">
        {/* AD badge */}
        <div
          className="shrink-0 self-start mt-0.5 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
          style={{
            background: "hsl(38 92% 50% / 0.15)",
            color: "hsl(38 92% 55%)",
            border: "1px solid hsl(38 92% 50% / 0.3)",
          }}
        >
          AD
        </div>

        {/* Thumbnail */}
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt={ad.bizName}
            className="shrink-0 rounded-xl object-cover"
            style={{ width: 52, height: 52 }}
          />
        )}

        {/* Text block */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
            style={{ color: "hsl(38 92% 55%)" }}
          >
            Sponsored · {ad.bizName}
          </div>
          <div
            className="font-display font-bold uppercase tracking-wide leading-tight text-foreground"
            style={{ fontSize: 14 }}
          >
            {ad.headline}
          </div>
          {ad.tagline && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {ad.tagline}
            </div>
          )}
        </div>

        {/* CTA + timer */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {ad.link && (
            <a
              href={ad.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold px-3.5 py-2 rounded-xl no-underline transition-all active:scale-95 whitespace-nowrap"
              style={{
                background: "hsl(38 92% 50%)",
                color: "#000",
              }}
            >
              Learn More →
            </a>
          )}
          {/* Countdown dismiss button */}
          <button
            onClick={onDismiss}
            className="relative w-7 h-7 flex items-center justify-center rounded-full cursor-pointer border-none"
            style={{ background: "hsl(var(--secondary))" }}
            title={`Closes in ${timeLeft}s`}
          >
            <svg
              className="absolute inset-0"
              viewBox="0 0 28 28"
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                cx="14"
                cy="14"
                r="12"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="2"
              />
              <circle
                cx="14"
                cy="14"
                r="12"
                fill="none"
                stroke="hsl(38 92% 50%)"
                strokeWidth="2"
                strokeDasharray={`${2 * Math.PI * 12}`}
                strokeDashoffset={`${2 * Math.PI * 12 * (1 - timeLeft / 8)}`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span className="text-[9px] font-bold text-foreground relative z-10">
              {timeLeft}
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── News Slider — full-bleed image with text overlay & fallback card ─────────
function NewsSlider({
  items,
  onViewAll,
}: {
  items: any[];
  onViewAll: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const t = setInterval(
      () => setCurrent((c) => (c + 1) % items.length),
      4000,
    );
    return () => clearInterval(t);
  }, [items.length, paused]);

  if (!items.length) return null;

  const n = items[current];
  const accentColor =
    n.accent === "teal" || n.type === "News"
      ? "hsl(175 80% 44%)"
      : "hsl(20 100% 50%)";
  const hasImage = !!n.imageUrl;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      setCurrent((c) =>
        delta < 0
          ? (c + 1) % items.length
          : (c - 1 + items.length) % items.length,
      );
    }
    touchStartX.current = null;
    setTimeout(() => setPaused(false), 800);
  };

  return (
    <div>
      <div
        className="overflow-hidden rounded-2xl select-none"
        style={{ border: "1px solid hsl(var(--border))" }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.button
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onViewAll}
            className="relative w-full text-left cursor-pointer border-none p-0 block"
            style={{
              background: hasImage ? "#000" : "hsl(var(--card))",
              minHeight: hasImage ? 200 : 120,
            }}
          >
            {/* Full-bleed background image */}
            {hasImage && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${n.imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: 0.75,
                }}
              />
            )}

            {/* Gradient scrim — stronger bottom for text legibility */}
            {hasImage && (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(0,0,0,0) 10%, rgba(0,0,0,0.78) 100%)",
                }}
              />
            )}

            {/* Colour accent top bar */}
            <div
              className="absolute inset-x-0 top-0 z-10"
              style={{ height: 3, background: accentColor }}
            />

            {/* Content */}
            <div
              className="relative z-10"
              style={{
                padding: hasImage ? "120px 16px 16px" : "20px 16px 16px",
              }}
            >
              {/* Tag badge */}
              <div
                className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mb-2"
                style={{
                  background: hasImage
                    ? "rgba(255,255,255,0.15)"
                    : `${accentColor}18`,
                  color: hasImage ? "#fff" : accentColor,
                  border: hasImage
                    ? "1px solid rgba(255,255,255,0.25)"
                    : `1px solid ${accentColor}30`,
                  backdropFilter: hasImage ? "blur(8px)" : "none",
                }}
              >
                {(n.tag ?? n.type ?? "NEWS").toUpperCase()}
              </div>

              {/* Title */}
              <div
                className="font-display font-bold uppercase leading-tight tracking-wide"
                style={{
                  fontSize: 16,
                  color: hasImage ? "#fff" : "hsl(var(--foreground))",
                  marginBottom: 6,
                }}
              >
                {n.title}
              </div>

              {/* Date + read more */}
              <div
                className="text-xs flex items-center justify-between"
                style={{
                  color: hasImage
                    ? "rgba(255,255,255,0.65)"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                <span className="flex items-center gap-1">
                  <MI icon="calendar_today" size={11} />
                  {n.date}
                </span>
                <span
                  className="flex items-center gap-1 font-semibold text-[11px]"
                  style={{ color: hasImage ? "#fff" : accentColor }}
                >
                  Read more <MI icon="arrow_forward" size={11} />
                </span>
              </div>
            </div>
          </motion.button>
        </AnimatePresence>

        {/* Dot indicators */}
        {items.length > 1 && (
          <div
            className="flex gap-1.5 justify-center py-2.5"
            style={{ background: "hsl(var(--card))" }}
          >
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className="border-none cursor-pointer p-0 transition-all"
                style={{
                  width: i === current ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background:
                    i === current ? accentColor : "hsl(var(--border))",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Drop-In Card (used inside CommunitySection) ──────────────────────────────
function DropInCard({ setPage }: { setPage: (p: string) => void }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        border: "1px solid hsl(175 80% 44% / 0.3)",
        background:
          "linear-gradient(135deg, hsl(175 80% 44% / 0.08) 0%, hsl(20 100% 50% / 0.06) 100%)",
      }}
    >
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
            style={{
              background: "hsl(175 80% 44% / 0.15)",
              color: "hsl(175 80% 44%)",
            }}
          >
            <MI icon="fitness_center" size={20} />
          </div>
          <div>
            <div
              className="font-display font-bold uppercase tracking-wide text-sm"
              style={{ color: "hsl(var(--foreground))" }}
            >
              Drop In Anytime
            </div>
            <div
              className="text-xs"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              No commitment — try a class or join us for a session
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Drop-ins / trial visitors book externally via Octiv */}
          <a
            href="https://app.octivfitness.com/schedule"
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold no-underline transition active:scale-95"
            style={{
              background: "hsl(175 80% 44%)",
              color: "#fff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MI icon="calendar_month" size={15} /> Book a class
          </a>
          <a
            href="https://wa.me/27645386375?text=Hi%2C%20I%27d%20like%20to%20book%20a%20trial%20at%20MK2%20Rivers"
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold no-underline transition active:scale-95"
            style={{
              border: "1px solid hsl(175 80% 44% / 0.4)",
              background: "hsl(175 80% 44% / 0.12)",
              color: "hsl(175 80% 44%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MI icon="chat" size={15} /> WhatsApp us
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Community Section (replaces section ⑦) ───────────────────────────────────
interface CommunitySectionProps {
  liveNews: any[];
  setPage: (p: string) => void;
}

function CommunitySection({ liveNews, setPage }: CommunitySectionProps) {
  const upcomingEvent = liveNews.find(
    (n) => n.type === "Event" && n.status !== "draft",
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.42 }}
      className="mb-8 space-y-3"
    >
      <SectionHead title="Community" />

      {/* Upcoming event card (live) or fallback */}
      <div
        className="rounded-2xl overflow-hidden cursor-pointer transition-opacity active:opacity-80"
        style={{
          border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))",
          position: "relative",
        }}
        onClick={() => setPage("News")}
      >
        {upcomingEvent?.imageUrl && (
          <>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${upcomingEvent.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: 0.18,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--card) / 0.95) 40%, transparent 100%)",
              }}
            />
          </>
        )}

        <div className="relative p-4">
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl"
              style={{
                background: "hsl(20 100% 50% / 0.15)",
                color: "hsl(20 100% 50%)",
              }}
            >
              <MI icon="celebration" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: "hsl(175 80% 44%)" }}
              >
                {upcomingEvent ? "Upcoming event" : "Connect with us"}
              </div>
              <div
                className="font-display font-bold uppercase tracking-wide leading-tight"
                style={{
                  fontSize: 15,
                  color: "hsl(var(--foreground))",
                }}
              >
                {upcomingEvent ? upcomingEvent.title : "Stay in the loop"}
              </div>
              {(upcomingEvent?.date || upcomingEvent?.desc) && (
                <div
                  className="text-xs mt-1"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {upcomingEvent.date && (
                    <span className="flex items-center gap-1">
                      <MI icon="calendar_today" size={11} />
                      {upcomingEvent.date}
                    </span>
                  )}
                </div>
              )}
              {!upcomingEvent && (
                <div
                  className="text-xs mt-1"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Chat with members, check events & challenges
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              className="h-10 rounded-xl font-display text-xs font-bold uppercase tracking-wider border-none cursor-pointer transition active:scale-95"
              style={{ background: "hsl(20 100% 50%)", color: "#000" }}
              onClick={(e) => {
                e.stopPropagation();
                setPage(upcomingEvent ? "News" : "Community");
              }}
            >
              {upcomingEvent ? "View event" : "Join community"}
            </button>
            <button
              className="h-10 rounded-xl font-display text-xs font-bold uppercase tracking-wider cursor-pointer transition active:scale-95"
              style={{
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--secondary))",
                color: "hsl(var(--foreground))",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPage("Community");
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <MI icon="chat" size={16} /> Chat
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Drop-In card */}
      <DropInCard setPage={setPage} />
    </motion.section>
  );
}

// ── Non-Member Banner (replaces section ①) ───────────────────────────────────
function NonMemberBanner({ setPage }: { setPage: (p: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-5 rounded-2xl overflow-hidden relative"
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(20 100% 50% / 0.3)",
      }}
    >
      {/* Accent top bar */}
      <div
        className="h-1 w-full"
        style={{
          background:
            "linear-gradient(90deg, hsl(20 100% 50%) 0%, hsl(175 80% 44%) 100%)",
        }}
      />

      <div className="p-4">
        <div
          className="font-display font-bold uppercase tracking-wide text-base mb-1"
          style={{ color: "hsl(var(--foreground))" }}
        >
          Ready to level up?
        </div>
        <div
          className="text-xs mb-4 leading-relaxed"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Join MK2 Rivers and train with a community that shows up. First trial
          class is on us.
        </div>

        {/* Perks row */}
        <div
          className="flex gap-3 mb-4 text-[11px]"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {["Expert coaches", "All levels welcome", "Flexible memberships"].map(
            (p) => (
              <span key={p} className="flex items-center gap-1">
                <MI icon="check_circle" size={13} />
                {p}
              </span>
            ),
          )}
        </div>

        {/* CTAs */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href="https://wa.me/27645386375?text=Hi%2C%20I%27d%20like%20to%20book%20a%20trial%20at%20MK2%20Rivers"
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold no-underline transition active:scale-95"
            style={{ background: "hsl(20 100% 50%)", color: "#000" }}
          >
            <MI icon="fitness_center" size={16} /> Book free trial
          </a>
          <button
            onClick={() => setPage("Membership")}
            className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold border-none cursor-pointer transition active:scale-95"
            style={{
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--secondary))",
              color: "hsl(var(--foreground))",
            }}
          >
            <MI icon="info" size={16} /> View plans
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick?: () => void };
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-foreground">
        {title}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1 text-xs font-medium border-none bg-transparent cursor-pointer"
          style={{ color: "hsl(175 80% 44%)" }}
        >
          {action.label} <span style={{ fontSize: 12 }}>→</span>
        </button>
      )}
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "primary" | "teal" | "success";
}) {
  const color = {
    primary: "hsl(20 100% 50%)",
    teal: "hsl(175 80% 44%)",
    success: "hsl(142 72% 37%)",
  }[tone];
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "hsl(var(--secondary))" }}
    >
      <MI icon={icon} size={16} />
      <div className="font-display text-xl font-bold mt-1.5" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

// ── Date helpers for ad scheduling ────────────────────────────────────────
// "YYYY-MM-DD" strings from <input type="date"> must be parsed as LOCAL
// midnight, not UTC midnight — new Date("2026-06-20") parses as UTC, which
// for timezones ahead of UTC (e.g. SAST, UTC+2) makes an ad read as expired
// for most/all of its intended last day, and a new ad's start date appear
// to begin a couple hours late. Parsing the Y/M/D components manually and
// constructing the Date in local time avoids that entirely. Expiry is
// treated as inclusive through the end of that local day.
function parseLocalDateStart(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function parseLocalDateEnd(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard({ setPage }: { setPage: (p: string) => void }) {
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();

  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [liveNews, setLiveNews] = useState<any[]>([]);
  const [activeAd, setActiveAd] = useState<any | null>(null);
  const [adDismissed, setAdDismissed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

  // ── Load live news ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, "admin_news"), (snap) => {
      if (!snap.exists()) return;
      const items = Object.values(snap.val()) as any[];
      const sorted = items.sort(
        (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      );
      setLiveNews(sorted.slice(0, 3));
    });
  }, [user]);

  // ── Load ads (one per session, respects expiry) ─────────────────────────────
  useEffect(() => {
    if (!user || adDismissed) return;
    return onValue(ref(db, "dashboard_ads"), (snap) => {
      if (!snap.exists()) return;
      const now = Date.now();
      const ads = Object.values(snap.val()) as any[];
      const live = ads.filter((a: any) => {
        if (a.status !== "published") return false;
        if (a.expiryDate && parseLocalDateEnd(a.expiryDate) < now) return false;
        if (a.startDate && parseLocalDateStart(a.startDate) > now) return false;
        return true;
      });
      if (live.length > 0) {
        const sorted = live.sort(
          (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
        );
        setActiveAd(sorted[0]);
      } else {
        setActiveAd(null);
      }
    });
  }, [user, adDismissed]);

  if (!user) return null;

  const firebaseUser = auth.currentUser;
  const emailVerified = firebaseUser?.emailVerified ?? true;
  const showVerifyBanner = !emailVerified && !verifyDismissed;

  const resendVerification = async () => {
    if (!firebaseUser) return;
    setResending(true);
    try {
      await sendEmailVerification(firebaseUser);
      setResendSent(true);
    } catch {}
    setResending(false);
  };

  const membership = (user as any).membership ?? "basic";
  // ─── FIX 2: Fallback to avoid crash ───────────────────────────────────────
  const memberConfig = MEMBERSHIP_CONFIG[membership] ?? {
    label: "Member",
    color: "hsl(20 100% 50%)",
    emoji: "🏋️",
  };
  const rewards = (user as any).rewards ?? {};
  const rewardStatus = getRewardStatus(user.checkIns, rewards);
  const firstName = user.name.split(" ")[0];
  const isBasicTier = membership === "basic";

  // const rawNews = liveNews.length > 0 ? liveNews : NEWS_PREVIEW;
  const rawNews = liveNews;
  const newsToShow = rawNews.map((n: any, i: number) => ({
    ...n,
    accent: n.accent ?? (i % 2 === 0 ? "orange" : "teal"),
    tag: n.tag ?? (n.type ?? "NEWS").toUpperCase(),
  }));

  // ── Action buttons ──────────────────────────────────────────────────────────
  // "Book a Class" now routes to the in-app Classes page (ClassBooking),
  // not the external Octiv schedule. Octiv stays only on the Drop-In card
  // for non-member / trial visitors.
  const ACTION_BTNS = [
    {
      label: "Book a Class",
      sub: "Today's schedule",
      icon: "calendar_month",
      page: "Classes",
      bg: "linear-gradient(135deg, hsl(20 100% 50%) 0%, hsl(20 100% 38%) 100%)",
      shadow: "0 10px 30px -12px hsl(20 100% 50% / 0.65)",
      iconBg: "rgba(0,0,0,0.18)",
      color: "#000",
    },
    {
      label: "Check In",
      sub: "Earn loyalty points",
      icon: "qr_code_scanner",
      page: "Checkin",
      bg: "hsl(var(--card))",
      shadow: "none",
      iconBg: "hsl(175 80% 44% / 0.15)",
      color: "hsl(var(--foreground))",
      border: "1px solid hsl(var(--border))",
    },
  ];

  // ── FAB speed-dial ──────────────────────────────────────────────────────────
  const FAB_ACTIONS = [
    { icon: "qr_code_scanner", label: "Check In", page: "Checkin" },
    { icon: "calendar_month", label: "Book Class", page: "Classes" },
    { icon: "auto_awesome", label: "AI Tools", page: "Tools" },
  ];

  return (
    <div className="relative">
      {/* ── Ambient glow backdrop ──────────────────────────────────────── */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 overflow-hidden"
        style={{ height: 520 }}
      >
        <div
          className="absolute rounded-full"
          style={{
            top: -128,
            left: "50%",
            transform: "translateX(-50%)",
            width: "120%",
            height: 384,
            background: "hsl(175 80% 44% / 0.09)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            top: -40,
            right: "-20%",
            width: 288,
            height: 288,
            background: "hsl(20 100% 50% / 0.09)",
            filter: "blur(80px)",
          }}
        />
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div
        className={`max-w-[1060px] mx-auto ${isMobile ? "px-4 py-5" : "px-6 py-10"}`}
      >
        {/* ── AD BANNER — top of page ─────────────────────────────────── */}
        <AnimatePresence>
          {activeAd && !adDismissed && (
            <AdBanner
              ad={activeAd}
              onDismiss={() => {
                setAdDismissed(true);
                setActiveAd(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* ①  NOT A MEMBER YET (REDESIGNED) ───────────────────────────── */}
        {isBasicTier && <NonMemberBanner setPage={setPage} />}

        {/* ②  GREETING ──────────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.04 }}
          className="mb-7"
        >
          <h1
            className="font-semibold leading-tight text-foreground"
            style={{ fontSize: isMobile ? 26 : 36 }}
          >
            {getGreeting()}, {firstName} 👋
          </h1>
          <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 font-medium"
              style={{ color: "hsl(175 80% 44%)" }}
            >
              <MI icon="workspace_premium" size={14} />
              {memberConfig.label} Member
            </span>
            <span className="text-muted-foreground">•</span>
            <span>{user.goal}</span>
          </p>
        </motion.header>

        {/* ③  EMAIL VERIFY BANNER ───────────────────────────────────────── */}
        {showVerifyBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
            style={{
              borderColor: "hsl(38 92% 50% / 0.4)",
              background: "hsl(38 92% 50% / 0.08)",
            }}
          >
            <span
              className="text-xs font-medium"
              style={{ color: "hsl(38 92% 45%)" }}
            >
              Please verify your email to unlock all features. Check your Junk
              or Spam folder if you don&apos;t see it.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {resendSent ? (
                <span className="text-[10px] text-green-500 font-bold">
                  Sent!
                </span>
              ) : (
                <button
                  onClick={resendVerification}
                  disabled={resending}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer"
                  style={{
                    border: "1px solid hsl(38 92% 50% / 0.4)",
                    background: "hsl(38 92% 50% / 0.18)",
                    color: "hsl(38 92% 45%)",
                  }}
                >
                  {resending ? "Sending…" : "Resend"}
                </button>
              )}
              <button
                onClick={() => setVerifyDismissed(true)}
                className="text-muted-foreground text-sm bg-transparent border-none cursor-pointer"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}

        {/* ⑤  3 BIG ACTION BUTTONS ──────────────────────────────────────── */}
        <section className="mb-8 space-y-3">
          {ACTION_BTNS.map((btn, i) => (
            <motion.button
              key={btn.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.08 }}
              onClick={() => setPage(btn.page)}
              className="group w-full rounded-2xl cursor-pointer transition-all active:scale-[0.98] hover:brightness-105 overflow-hidden text-left"
              style={{
                background: btn.bg,
                boxShadow: btn.shadow,
                border: (btn as any).border ?? "none",
              }}
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: btn.iconBg }}
                >
                  <MI icon={btn.icon} size={24} />
                </div>
                <div className="flex-1">
                  <div
                    className="font-display text-lg font-bold uppercase tracking-wide leading-tight"
                    style={{ color: btn.color }}
                  >
                    {btn.label}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: btn.color, opacity: 0.8 }}
                  >
                    {btn.sub}
                  </div>
                </div>
                <span
                  className="transition group-hover:translate-x-0.5"
                  style={{ color: btn.color, opacity: 0.7 }}
                >
                  <MI icon="chevron_right" size={22} />
                </span>
              </div>
            </motion.button>
          ))}
        </section>

        {/* ⑥  MY PROGRESS ──────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36 }}
          className="mb-8"
        >
          <SectionHead title="My Progress" />
          <div
            className="rounded-2xl p-4"
            style={{
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
            }}
          >
            <div className="grid grid-cols-3 gap-3">
              <StatTile
                icon="bolt"
                label="Workouts"
                value={String(user.workouts.length)}
                tone="primary"
              />
              <StatTile
                icon="calendar_month"
                label="Classes / mo"
                value={String(user.bookings.length)}
                tone="teal"
              />
              <StatTile
                icon="where_to_vote"
                label="Check-ins"
                value={String(user.checkIns.length)}
                tone="success"
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "PR Logbook", page: "PRLogbook" },
                { label: "Leaderboard", page: "Leaderboard" },
                { label: "Measure", page: "InBody" },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => setPage(a.page)}
                  className="rounded-xl py-2.5 text-xs font-medium text-foreground transition cursor-pointer"
                  style={{
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--secondary))",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "hsl(175 80% 44% / 0.6)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      "hsl(var(--border))";
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ⑦  COMMUNITY (REDESIGNED) ─────────────────────────────────── */}
        <CommunitySection liveNews={liveNews} setPage={setPage} />

        {/* ⑧  NEWS & EVENTS (REDESIGNED SLIDER) ───────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.48 }}
          className="mb-8"
        >
          <SectionHead
            title="News & Events"
            action={{ label: "See all", onClick: () => setPage("News") }}
          />
          <NewsSlider items={newsToShow} onViewAll={() => setPage("News")} />
        </motion.section>

        {/* ── Admin access (the DSmart partner-credit footer lives in    */}
        {/*    Layout.tsx and wraps every page — it must NOT be repeated */}
        {/*    here, or it renders twice on the Dashboard) ─────────────── */}
        <div className="mt-4 mb-6 flex justify-center">
          <button
            onClick={() => {
              window.location.hash = "admin";
              window.location.reload();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-none cursor-pointer transition-opacity hover:opacity-80"
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
            }}
            title="Admin Panel"
          >
            <MI icon="admin_panel_settings" size={14} />
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Admin
            </span>
          </button>
        </div>
      </div>

      {/* ── FAB speed-dial ─────────────────────────────────────────────── */}
      <div
        className="pointer-events-none fixed z-40 flex flex-col items-end gap-2"
        style={{ bottom: isMobile ? 88 : 24, right: 20 }}
      >
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto flex flex-col items-end gap-2"
            >
              {FAB_ACTIONS.map((a, i) => (
                <motion.button
                  key={a.label}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => {
                    setFabOpen(false);
                    setPage(a.page);
                  }}
                  className="flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-foreground cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                  style={{
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  <span style={{ color: "hsl(175 80% 44%)" }}>
                    <MI icon={a.icon} size={16} />
                  </span>
                  {a.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={() => setFabOpen((v) => !v)}
          className="pointer-events-auto w-14 h-14 rounded-full border-none cursor-pointer flex items-center justify-center"
          animate={{ rotate: fabOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{
            background: "hsl(20 100% 50%)",
            color: "#000",
            boxShadow: "0 12px 32px -8px hsl(20 100% 50% / 0.65)",
          }}
        >
          <MI icon={fabOpen ? "close" : "add"} size={26} />
        </motion.button>
      </div>
    </div>
  );
}

// import { useEffect, useState, useRef } from "react";
// import { useAuth } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { motion, AnimatePresence } from "framer-motion";
// import { auth, db } from "@/lib/firebase";
// import { sendEmailVerification } from "firebase/auth";
// import { ref, onValue } from "firebase/database";

// function MI({ icon, size = 20 }: { icon: string; size?: number }) {
//   return (
//     <span
//       className="material-symbols-rounded"
//       style={{ fontSize: size, lineHeight: 1 }}
//     >
//       {icon}
//     </span>
//   );
// }

// // ─── UPDATED: Include all membership tiers ──────────────────────────────
// const MEMBERSHIP_CONFIG: Record<
//   string,
//   { label: string; color: string; emoji: string }
// > = {
//   basic: { label: "Basic", color: "#9ca3af", emoji: "🔵" },
//   silver: { label: "Silver", color: "#e2e8f0", emoji: "⚪" },
//   gold: { label: "Gold", color: "hsl(38 92% 50%)", emoji: "🥇" },
//   u18: { label: "Under 18", color: "hsl(263 85% 58%)", emoji: "🟣" },
//   hybrid_12m: {
//     label: "Hybrid 12-month",
//     color: "hsl(217 91% 53%)",
//     emoji: "🔵",
//   },
//   hybrid_6m: {
//     label: "Hybrid 6-month",
//     color: "hsl(217 91% 53%)",
//     emoji: "🔵",
//   },
//   hybrid_m2m: {
//     label: "Hybrid M-to-M",
//     color: "hsl(217 91% 53%)",
//     emoji: "🔵",
//   },
//   unlimited_12m: {
//     label: "Unlimited 12-month",
//     color: "hsl(20 100% 50%)",
//     emoji: "🟠",
//   },
//   unlimited_6m: {
//     label: "Unlimited 6-month",
//     color: "hsl(20 100% 50%)",
//     emoji: "🟠",
//   },
//   unlimited_m2m: {
//     label: "Unlimited M-to-M",
//     color: "hsl(20 100% 50%)",
//     emoji: "🟠",
//   },
// };

// const NEWS_PREVIEW = [
//   {
//     tag: "EVENT",
//     title: "30-Day Transformation Challenge",
//     date: "1 Apr 2026",
//     accent: "orange" as const,
//     imageUrl: "",
//   },
//   {
//     tag: "NEWS",
//     title: "New CrossFit Equipment Arrived",
//     date: "20 Mar 2026",
//     accent: "teal" as const,
//     imageUrl: "",
//   },
//   {
//     tag: "EVENT",
//     title: "Charity Fun Run — 5km & 10km",
//     date: "12 Apr 2026",
//     accent: "orange" as const,
//     imageUrl: "",
//   },
// ];

// const CHECKIN_MILESTONE = 40;

// export function getRewardStatus(checkIns: any[], rewards: Record<string, any>) {
//   const total = checkIns.length;
//   const milestonesEarned = Math.floor(total / CHECKIN_MILESTONE);
//   const rewardsRedeemed = Object.values(rewards ?? {}).filter(
//     (r) => r.status === "redeemed",
//   ).length;
//   const rewardsPending = Object.values(rewards ?? {}).filter(
//     (r) => r.status === "pending",
//   );
//   const nextMilestoneAt = (milestonesEarned + 1) * CHECKIN_MILESTONE;
//   const progressToNext = total % CHECKIN_MILESTONE;
//   return {
//     total,
//     milestonesEarned,
//     rewardsRedeemed,
//     rewardsPending,
//     nextMilestoneAt,
//     progressToNext,
//     pct: Math.round((progressToNext / CHECKIN_MILESTONE) * 100),
//   };
// }

// function getGreeting() {
//   const h = new Date().getHours();
//   if (h < 12) return "Good Morning";
//   if (h < 17) return "Good Afternoon";
//   return "Good Evening";
// }

// // ── Ad Banner (premium version, session-limited, expiry-aware) ──────────────
// function AdBanner({ ad, onDismiss }: { ad: any; onDismiss: () => void }) {
//   const [timeLeft, setTimeLeft] = useState(8);

//   useEffect(() => {
//     const t = setInterval(() => {
//       setTimeLeft((prev) => {
//         if (prev <= 1) {
//           clearInterval(t);
//           onDismiss();
//           return 0;
//         }
//         return prev - 1;
//       });
//     }, 1000);
//     return () => clearInterval(t);
//   }, [onDismiss]);

//   return (
//     <motion.div
//       initial={{ opacity: 0, y: -16 }}
//       animate={{ opacity: 1, y: 0 }}
//       exit={{ opacity: 0, y: -12 }}
//       transition={{ duration: 0.35, ease: "easeOut" }}
//       className="relative overflow-hidden rounded-2xl mb-6"
//       style={{
//         background: ad.imageUrl
//           ? "hsl(var(--card))"
//           : "linear-gradient(135deg, hsl(38 92% 50% / 0.10) 0%, hsl(20 100% 50% / 0.08) 100%)",
//         border: "1px solid hsl(38 92% 50% / 0.35)",
//         boxShadow: "0 4px 24px -6px hsl(38 92% 50% / 0.20)",
//       }}
//     >
//       {/* Full bleed background image with scrim */}
//       {ad.imageUrl && (
//         <>
//           <div
//             className="absolute inset-0"
//             style={{
//               backgroundImage: `url(${ad.imageUrl})`,
//               backgroundSize: "cover",
//               backgroundPosition: "center",
//               opacity: 0.22,
//             }}
//           />
//           <div
//             className="absolute inset-0"
//             style={{
//               background:
//                 "linear-gradient(90deg, hsl(var(--card) / 0.92) 0%, hsl(var(--card) / 0.60) 100%)",
//             }}
//           />
//         </>
//       )}

//       {/* Gold accent top bar */}
//       <div
//         className="absolute inset-x-0 top-0"
//         style={{
//           height: 3,
//           background:
//             "linear-gradient(90deg, hsl(38 92% 50%) 0%, hsl(20 100% 50%) 100%)",
//         }}
//       />

//       {/* Main content */}
//       <div className="relative flex items-center gap-3 px-4 pt-4 pb-3">
//         {/* AD badge */}
//         <div
//           className="shrink-0 self-start mt-0.5 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
//           style={{
//             background: "hsl(38 92% 50% / 0.15)",
//             color: "hsl(38 92% 55%)",
//             border: "1px solid hsl(38 92% 50% / 0.3)",
//           }}
//         >
//           AD
//         </div>

//         {/* Thumbnail */}
//         {ad.imageUrl && (
//           <img
//             src={ad.imageUrl}
//             alt={ad.bizName}
//             className="shrink-0 rounded-xl object-cover"
//             style={{ width: 52, height: 52 }}
//           />
//         )}

//         {/* Text block */}
//         <div className="flex-1 min-w-0">
//           <div
//             className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
//             style={{ color: "hsl(38 92% 55%)" }}
//           >
//             Sponsored · {ad.bizName}
//           </div>
//           <div
//             className="font-display font-bold uppercase tracking-wide leading-tight text-foreground"
//             style={{ fontSize: 14 }}
//           >
//             {ad.headline}
//           </div>
//           {ad.tagline && (
//             <div className="text-xs text-muted-foreground mt-0.5 truncate">
//               {ad.tagline}
//             </div>
//           )}
//         </div>

//         {/* CTA + timer */}
//         <div className="flex flex-col items-end gap-2 shrink-0">
//           {ad.link && (
//             <a
//               href={ad.link}
//               target="_blank"
//               rel="noopener noreferrer"
//               className="text-[11px] font-bold px-3.5 py-2 rounded-xl no-underline transition-all active:scale-95 whitespace-nowrap"
//               style={{
//                 background: "hsl(38 92% 50%)",
//                 color: "#000",
//               }}
//             >
//               Learn More →
//             </a>
//           )}
//           {/* Countdown dismiss button */}
//           <button
//             onClick={onDismiss}
//             className="relative w-7 h-7 flex items-center justify-center rounded-full cursor-pointer border-none"
//             style={{ background: "hsl(var(--secondary))" }}
//             title={`Closes in ${timeLeft}s`}
//           >
//             <svg
//               className="absolute inset-0"
//               viewBox="0 0 28 28"
//               style={{ transform: "rotate(-90deg)" }}
//             >
//               <circle
//                 cx="14"
//                 cy="14"
//                 r="12"
//                 fill="none"
//                 stroke="hsl(var(--border))"
//                 strokeWidth="2"
//               />
//               <circle
//                 cx="14"
//                 cy="14"
//                 r="12"
//                 fill="none"
//                 stroke="hsl(38 92% 50%)"
//                 strokeWidth="2"
//                 strokeDasharray={`${2 * Math.PI * 12}`}
//                 strokeDashoffset={`${2 * Math.PI * 12 * (1 - timeLeft / 8)}`}
//                 style={{ transition: "stroke-dashoffset 1s linear" }}
//               />
//             </svg>
//             <span className="text-[9px] font-bold text-foreground relative z-10">
//               {timeLeft}
//             </span>
//           </button>
//         </div>
//       </div>
//     </motion.div>
//   );
// }

// // ── News Slider — full-bleed image with text overlay & fallback card ─────────
// function NewsSlider({
//   items,
//   onViewAll,
// }: {
//   items: any[];
//   onViewAll: () => void;
// }) {
//   const [current, setCurrent] = useState(0);
//   const [paused, setPaused] = useState(false);
//   const touchStartX = useRef<number | null>(null);

//   useEffect(() => {
//     if (items.length <= 1 || paused) return;
//     const t = setInterval(
//       () => setCurrent((c) => (c + 1) % items.length),
//       4000,
//     );
//     return () => clearInterval(t);
//   }, [items.length, paused]);

//   if (!items.length) return null;

//   const n = items[current];
//   const accentColor =
//     n.accent === "teal" || n.type === "News"
//       ? "hsl(175 80% 44%)"
//       : "hsl(20 100% 50%)";
//   const hasImage = !!n.imageUrl;

//   const handleTouchStart = (e: React.TouchEvent) => {
//     touchStartX.current = e.touches[0].clientX;
//     setPaused(true);
//   };
//   const handleTouchEnd = (e: React.TouchEvent) => {
//     if (touchStartX.current === null) return;
//     const delta = e.changedTouches[0].clientX - touchStartX.current;
//     if (Math.abs(delta) > 40) {
//       setCurrent((c) =>
//         delta < 0
//           ? (c + 1) % items.length
//           : (c - 1 + items.length) % items.length,
//       );
//     }
//     touchStartX.current = null;
//     setTimeout(() => setPaused(false), 800);
//   };

//   return (
//     <div>
//       <div
//         className="overflow-hidden rounded-2xl select-none"
//         style={{ border: "1px solid hsl(var(--border))" }}
//         onMouseEnter={() => setPaused(true)}
//         onMouseLeave={() => setPaused(false)}
//         onTouchStart={handleTouchStart}
//         onTouchEnd={handleTouchEnd}
//       >
//         <AnimatePresence mode="wait">
//           <motion.button
//             key={current}
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             exit={{ opacity: 0 }}
//             transition={{ duration: 0.3 }}
//             onClick={onViewAll}
//             className="relative w-full text-left cursor-pointer border-none p-0 block"
//             style={{
//               background: hasImage ? "#000" : "hsl(var(--card))",
//               minHeight: hasImage ? 200 : 120,
//             }}
//           >
//             {/* Full-bleed background image */}
//             {hasImage && (
//               <div
//                 className="absolute inset-0"
//                 style={{
//                   backgroundImage: `url(${n.imageUrl})`,
//                   backgroundSize: "cover",
//                   backgroundPosition: "center",
//                   opacity: 0.75,
//                 }}
//               />
//             )}

//             {/* Gradient scrim — stronger bottom for text legibility */}
//             {hasImage && (
//               <div
//                 className="absolute inset-0"
//                 style={{
//                   background:
//                     "linear-gradient(to bottom, rgba(0,0,0,0) 10%, rgba(0,0,0,0.78) 100%)",
//                 }}
//               />
//             )}

//             {/* Colour accent top bar */}
//             <div
//               className="absolute inset-x-0 top-0 z-10"
//               style={{ height: 3, background: accentColor }}
//             />

//             {/* Content */}
//             <div
//               className="relative z-10"
//               style={{
//                 padding: hasImage ? "120px 16px 16px" : "20px 16px 16px",
//               }}
//             >
//               {/* Tag badge */}
//               <div
//                 className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mb-2"
//                 style={{
//                   background: hasImage
//                     ? "rgba(255,255,255,0.15)"
//                     : `${accentColor}18`,
//                   color: hasImage ? "#fff" : accentColor,
//                   border: hasImage
//                     ? "1px solid rgba(255,255,255,0.25)"
//                     : `1px solid ${accentColor}30`,
//                   backdropFilter: hasImage ? "blur(8px)" : "none",
//                 }}
//               >
//                 {(n.tag ?? n.type ?? "NEWS").toUpperCase()}
//               </div>

//               {/* Title */}
//               <div
//                 className="font-display font-bold uppercase leading-tight tracking-wide"
//                 style={{
//                   fontSize: 16,
//                   color: hasImage ? "#fff" : "hsl(var(--foreground))",
//                   marginBottom: 6,
//                 }}
//               >
//                 {n.title}
//               </div>

//               {/* Date + read more */}
//               <div
//                 className="text-xs flex items-center justify-between"
//                 style={{
//                   color: hasImage
//                     ? "rgba(255,255,255,0.65)"
//                     : "hsl(var(--muted-foreground))",
//                 }}
//               >
//                 <span className="flex items-center gap-1">
//                   <MI icon="calendar_today" size={11} />
//                   {n.date}
//                 </span>
//                 <span
//                   className="flex items-center gap-1 font-semibold text-[11px]"
//                   style={{ color: hasImage ? "#fff" : accentColor }}
//                 >
//                   Read more <MI icon="arrow_forward" size={11} />
//                 </span>
//               </div>
//             </div>
//           </motion.button>
//         </AnimatePresence>

//         {/* Dot indicators */}
//         {items.length > 1 && (
//           <div
//             className="flex gap-1.5 justify-center py-2.5"
//             style={{ background: "hsl(var(--card))" }}
//           >
//             {items.map((_, i) => (
//               <button
//                 key={i}
//                 onClick={() => setCurrent(i)}
//                 className="border-none cursor-pointer p-0 transition-all"
//                 style={{
//                   width: i === current ? 20 : 6,
//                   height: 6,
//                   borderRadius: 3,
//                   background:
//                     i === current ? accentColor : "hsl(var(--border))",
//                 }}
//               />
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // ── Drop-In Card (used inside CommunitySection) ──────────────────────────────
// function DropInCard({ setPage }: { setPage: (p: string) => void }) {
//   return (
//     <div
//       className="rounded-2xl overflow-hidden"
//       style={{
//         border: "1px solid hsl(175 80% 44% / 0.3)",
//         background:
//           "linear-gradient(135deg, hsl(175 80% 44% / 0.08) 0%, hsl(20 100% 50% / 0.06) 100%)",
//       }}
//     >
//       <div className="p-4">
//         <div className="flex items-center gap-3 mb-3">
//           <div
//             className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
//             style={{
//               background: "hsl(175 80% 44% / 0.15)",
//               color: "hsl(175 80% 44%)",
//             }}
//           >
//             <MI icon="fitness_center" size={20} />
//           </div>
//           <div>
//             <div
//               className="font-display font-bold uppercase tracking-wide text-sm"
//               style={{ color: "hsl(var(--foreground))" }}
//             >
//               Drop In Anytime
//             </div>
//             <div
//               className="text-xs"
//               style={{ color: "hsl(var(--muted-foreground))" }}
//             >
//               No commitment — try a class or join us for a session
//             </div>
//           </div>
//         </div>

//         <div className="grid grid-cols-2 gap-2">
//           {/* Drop-ins / trial visitors book externally via Octiv */}
//           <a
//             href="https://app.octivfitness.com/schedule"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold no-underline transition active:scale-95"
//             style={{
//               background: "hsl(175 80% 44%)",
//               color: "#fff",
//             }}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <MI icon="calendar_month" size={15} /> Book a class
//           </a>
//           <a
//             href="https://wa.me/27645386375?text=Hi%2C%20I%27d%20like%20to%20book%20a%20trial%20at%20MK2%20Rivers"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold no-underline transition active:scale-95"
//             style={{
//               border: "1px solid hsl(175 80% 44% / 0.4)",
//               background: "hsl(175 80% 44% / 0.12)",
//               color: "hsl(175 80% 44%)",
//             }}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <MI icon="chat" size={15} /> WhatsApp us
//           </a>
//         </div>
//       </div>
//     </div>
//   );
// }

// // ── Community Section (replaces section ⑦) ───────────────────────────────────
// interface CommunitySectionProps {
//   liveNews: any[];
//   setPage: (p: string) => void;
// }

// function CommunitySection({ liveNews, setPage }: CommunitySectionProps) {
//   const upcomingEvent = liveNews.find(
//     (n) => n.type === "Event" && n.status !== "draft",
//   );

//   return (
//     <motion.section
//       initial={{ opacity: 0, y: 8 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ delay: 0.42 }}
//       className="mb-8 space-y-3"
//     >
//       <SectionHead title="Community" />

//       {/* Upcoming event card (live) or fallback */}
//       <div
//         className="rounded-2xl overflow-hidden cursor-pointer transition-opacity active:opacity-80"
//         style={{
//           border: "1px solid hsl(var(--border))",
//           background: "hsl(var(--card))",
//           position: "relative",
//         }}
//         onClick={() => setPage("News")}
//       >
//         {upcomingEvent?.imageUrl && (
//           <>
//             <div
//               className="absolute inset-0"
//               style={{
//                 backgroundImage: `url(${upcomingEvent.imageUrl})`,
//                 backgroundSize: "cover",
//                 backgroundPosition: "center",
//                 opacity: 0.18,
//               }}
//             />
//             <div
//               className="absolute inset-0"
//               style={{
//                 background:
//                   "linear-gradient(135deg, hsl(var(--card) / 0.95) 40%, transparent 100%)",
//               }}
//             />
//           </>
//         )}

//         <div className="relative p-4">
//           <div className="flex items-start gap-3 mb-4">
//             <div
//               className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl"
//               style={{
//                 background: "hsl(20 100% 50% / 0.15)",
//                 color: "hsl(20 100% 50%)",
//               }}
//             >
//               <MI icon="celebration" size={24} />
//             </div>
//             <div className="flex-1 min-w-0">
//               <div
//                 className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
//                 style={{ color: "hsl(175 80% 44%)" }}
//               >
//                 {upcomingEvent ? "Upcoming event" : "Connect with us"}
//               </div>
//               <div
//                 className="font-display font-bold uppercase tracking-wide leading-tight"
//                 style={{
//                   fontSize: 15,
//                   color: "hsl(var(--foreground))",
//                 }}
//               >
//                 {upcomingEvent ? upcomingEvent.title : "Stay in the loop"}
//               </div>
//               {(upcomingEvent?.date || upcomingEvent?.desc) && (
//                 <div
//                   className="text-xs mt-1"
//                   style={{ color: "hsl(var(--muted-foreground))" }}
//                 >
//                   {upcomingEvent.date && (
//                     <span className="flex items-center gap-1">
//                       <MI icon="calendar_today" size={11} />
//                       {upcomingEvent.date}
//                     </span>
//                   )}
//                 </div>
//               )}
//               {!upcomingEvent && (
//                 <div
//                   className="text-xs mt-1"
//                   style={{ color: "hsl(var(--muted-foreground))" }}
//                 >
//                   Chat with members, check events & challenges
//                 </div>
//               )}
//             </div>
//           </div>

//           {/* Action buttons */}
//           <div className="grid grid-cols-2 gap-2">
//             <button
//               className="h-10 rounded-xl font-display text-xs font-bold uppercase tracking-wider border-none cursor-pointer transition active:scale-95"
//               style={{ background: "hsl(20 100% 50%)", color: "#000" }}
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setPage(upcomingEvent ? "News" : "Community");
//               }}
//             >
//               {upcomingEvent ? "View event" : "Join community"}
//             </button>
//             <button
//               className="h-10 rounded-xl font-display text-xs font-bold uppercase tracking-wider cursor-pointer transition active:scale-95"
//               style={{
//                 border: "1px solid hsl(var(--border))",
//                 background: "hsl(var(--secondary))",
//                 color: "hsl(var(--foreground))",
//               }}
//               onClick={(e) => {
//                 e.stopPropagation();
//                 setPage("Community");
//               }}
//             >
//               <span className="flex items-center justify-center gap-1.5">
//                 <MI icon="chat" size={16} /> Chat
//               </span>
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Drop-In card */}
//       <DropInCard setPage={setPage} />
//     </motion.section>
//   );
// }

// // ── Non-Member Banner (replaces section ①) ───────────────────────────────────
// function NonMemberBanner({ setPage }: { setPage: (p: string) => void }) {
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: -8 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ duration: 0.3 }}
//       className="mb-5 rounded-2xl overflow-hidden relative"
//       style={{
//         background: "hsl(var(--card))",
//         border: "1px solid hsl(20 100% 50% / 0.3)",
//       }}
//     >
//       {/* Accent top bar */}
//       <div
//         className="h-1 w-full"
//         style={{
//           background:
//             "linear-gradient(90deg, hsl(20 100% 50%) 0%, hsl(175 80% 44%) 100%)",
//         }}
//       />

//       <div className="p-4">
//         <div
//           className="font-display font-bold uppercase tracking-wide text-base mb-1"
//           style={{ color: "hsl(var(--foreground))" }}
//         >
//           Ready to level up?
//         </div>
//         <div
//           className="text-xs mb-4 leading-relaxed"
//           style={{ color: "hsl(var(--muted-foreground))" }}
//         >
//           Join MK2 Rivers and train with a community that shows up. First trial
//           class is on us.
//         </div>

//         {/* Perks row */}
//         <div
//           className="flex gap-3 mb-4 text-[11px]"
//           style={{ color: "hsl(var(--muted-foreground))" }}
//         >
//           {["Expert coaches", "All levels welcome", "Flexible memberships"].map(
//             (p) => (
//               <span key={p} className="flex items-center gap-1">
//                 <MI icon="check_circle" size={13} />
//                 {p}
//               </span>
//             ),
//           )}
//         </div>

//         {/* CTAs */}
//         <div className="grid grid-cols-2 gap-2">
//           <a
//             href="https://wa.me/27645386375?text=Hi%2C%20I%27d%20like%20to%20book%20a%20trial%20at%20MK2%20Rivers"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold no-underline transition active:scale-95"
//             style={{ background: "hsl(20 100% 50%)", color: "#000" }}
//           >
//             <MI icon="fitness_center" size={16} /> Book free trial
//           </a>
//           <button
//             onClick={() => setPage("Membership")}
//             className="h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold border-none cursor-pointer transition active:scale-95"
//             style={{
//               border: "1px solid hsl(var(--border))",
//               background: "hsl(var(--secondary))",
//               color: "hsl(var(--foreground))",
//             }}
//           >
//             <MI icon="info" size={16} /> View plans
//           </button>
//         </div>
//       </div>
//     </motion.div>
//   );
// }

// // ── Section heading ───────────────────────────────────────────────────────────
// function SectionHead({
//   title,
//   action,
// }: {
//   title: string;
//   action?: { label: string; onClick?: () => void };
// }) {
//   return (
//     <div className="mb-3 flex items-end justify-between">
//       <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-foreground">
//         {title}
//       </h2>
//       {action && (
//         <button
//           onClick={action.onClick}
//           className="inline-flex items-center gap-1 text-xs font-medium border-none bg-transparent cursor-pointer"
//           style={{ color: "hsl(175 80% 44%)" }}
//         >
//           {action.label} <span style={{ fontSize: 12 }}>→</span>
//         </button>
//       )}
//     </div>
//   );
// }

// // ── Stat tile ─────────────────────────────────────────────────────────────────
// function StatTile({
//   icon,
//   label,
//   value,
//   tone,
// }: {
//   icon: string;
//   label: string;
//   value: string;
//   tone: "primary" | "teal" | "success";
// }) {
//   const color = {
//     primary: "hsl(20 100% 50%)",
//     teal: "hsl(175 80% 44%)",
//     success: "hsl(142 72% 37%)",
//   }[tone];
//   return (
//     <div
//       className="rounded-xl p-3"
//       style={{ background: "hsl(var(--secondary))" }}
//     >
//       <MI icon={icon} size={16} />
//       <div className="font-display text-xl font-bold mt-1.5" style={{ color }}>
//         {value}
//       </div>
//       <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
//         {label}
//       </div>
//     </div>
//   );
// }

// // ── Date helpers for ad scheduling ────────────────────────────────────────
// // "YYYY-MM-DD" strings from <input type="date"> must be parsed as LOCAL
// // midnight, not UTC midnight — new Date("2026-06-20") parses as UTC, which
// // for timezones ahead of UTC (e.g. SAST, UTC+2) makes an ad read as expired
// // for most/all of its intended last day, and a new ad's start date appear
// // to begin a couple hours late. Parsing the Y/M/D components manually and
// // constructing the Date in local time avoids that entirely. Expiry is
// // treated as inclusive through the end of that local day.
// function parseLocalDateStart(dateStr: string): number {
//   const [y, m, d] = dateStr.split("-").map(Number);
//   return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
// }
// function parseLocalDateEnd(dateStr: string): number {
//   const [y, m, d] = dateStr.split("-").map(Number);
//   return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
// }

// // ── Dashboard ─────────────────────────────────────────────────────────────────
// export function Dashboard({ setPage }: { setPage: (p: string) => void }) {
//   const { user } = useAuth();
//   const { isMobile } = useBreakpoint();

//   const [verifyDismissed, setVerifyDismissed] = useState(false);
//   const [resendSent, setResendSent] = useState(false);
//   const [resending, setResending] = useState(false);
//   const [liveNews, setLiveNews] = useState<any[]>([]);
//   const [activeAd, setActiveAd] = useState<any | null>(null);
//   const [adDismissed, setAdDismissed] = useState(false);
//   const [fabOpen, setFabOpen] = useState(false);

//   // ── Load live news ──────────────────────────────────────────────────────────
//   useEffect(() => {
//     if (!user) return;
//     return onValue(ref(db, "admin_news"), (snap) => {
//       if (!snap.exists()) return;
//       const items = Object.values(snap.val()) as any[];
//       const sorted = items.sort(
//         (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
//       );
//       setLiveNews(sorted.slice(0, 3));
//     });
//   }, [user]);

//   // ── Load ads (one per session, respects expiry) ─────────────────────────────
//   useEffect(() => {
//     if (!user || adDismissed) return;
//     return onValue(ref(db, "dashboard_ads"), (snap) => {
//       if (!snap.exists()) return;
//       const now = Date.now();
//       const ads = Object.values(snap.val()) as any[];
//       const live = ads.filter((a: any) => {
//         if (a.status !== "published") return false;
//         if (a.expiryDate && parseLocalDateEnd(a.expiryDate) < now) return false;
//         if (a.startDate && parseLocalDateStart(a.startDate) > now) return false;
//         return true;
//       });
//       if (live.length > 0) {
//         const sorted = live.sort(
//           (a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
//         );
//         setActiveAd(sorted[0]);
//       } else {
//         setActiveAd(null);
//       }
//     });
//   }, [user, adDismissed]);

//   if (!user) return null;

//   const firebaseUser = auth.currentUser;
//   const emailVerified = firebaseUser?.emailVerified ?? true;
//   const showVerifyBanner = !emailVerified && !verifyDismissed;

//   const resendVerification = async () => {
//     if (!firebaseUser) return;
//     setResending(true);
//     try {
//       await sendEmailVerification(firebaseUser);
//       setResendSent(true);
//     } catch {}
//     setResending(false);
//   };

//   const membership = (user as any).membership ?? "basic";
//   // ─── FIX 2: Fallback to avoid crash ───────────────────────────────────────
//   const memberConfig = MEMBERSHIP_CONFIG[membership] ?? {
//     label: "Member",
//     color: "hsl(20 100% 50%)",
//     emoji: "🏋️",
//   };
//   const rewards = (user as any).rewards ?? {};
//   const rewardStatus = getRewardStatus(user.checkIns, rewards);
//   const firstName = user.name.split(" ")[0];
//   const isBasicTier = membership === "basic";

//   const rawNews = liveNews.length > 0 ? liveNews : NEWS_PREVIEW;
//   const newsToShow = rawNews.map((n: any, i: number) => ({
//     ...n,
//     accent: n.accent ?? (i % 2 === 0 ? "orange" : "teal"),
//     tag: n.tag ?? (n.type ?? "NEWS").toUpperCase(),
//   }));

//   // ── Action buttons ──────────────────────────────────────────────────────────
//   // "Book a Class" now routes to the in-app Classes page (ClassBooking),
//   // not the external Octiv schedule. Octiv stays only on the Drop-In card
//   // for non-member / trial visitors.
//   const ACTION_BTNS = [
//     {
//       label: "Book a Class",
//       sub: "Today's schedule",
//       icon: "calendar_month",
//       page: "Classes",
//       bg: "linear-gradient(135deg, hsl(20 100% 50%) 0%, hsl(20 100% 38%) 100%)",
//       shadow: "0 10px 30px -12px hsl(20 100% 50% / 0.65)",
//       iconBg: "rgba(0,0,0,0.18)",
//       color: "#000",
//     },
//     {
//       label: "Check In",
//       sub: "Earn loyalty points",
//       icon: "qr_code_scanner",
//       page: "Checkin",
//       bg: "hsl(var(--card))",
//       shadow: "none",
//       iconBg: "hsl(175 80% 44% / 0.15)",
//       color: "hsl(var(--foreground))",
//       border: "1px solid hsl(var(--border))",
//     },
//   ];

//   // ── FAB speed-dial ──────────────────────────────────────────────────────────
//   const FAB_ACTIONS = [
//     { icon: "qr_code_scanner", label: "Check In", page: "Checkin" },
//     { icon: "calendar_month", label: "Book Class", page: "Classes" },
//     { icon: "auto_awesome", label: "AI Tools", page: "Tools" },
//   ];

//   return (
//     <div className="relative">
//       {/* ── Ambient glow backdrop ──────────────────────────────────────── */}
//       <div
//         className="pointer-events-none fixed inset-x-0 top-0 -z-10 overflow-hidden"
//         style={{ height: 520 }}
//       >
//         <div
//           className="absolute rounded-full"
//           style={{
//             top: -128,
//             left: "50%",
//             transform: "translateX(-50%)",
//             width: "120%",
//             height: 384,
//             background: "hsl(175 80% 44% / 0.09)",
//             filter: "blur(80px)",
//           }}
//         />
//         <div
//           className="absolute rounded-full"
//           style={{
//             top: -40,
//             right: "-20%",
//             width: 288,
//             height: 288,
//             background: "hsl(20 100% 50% / 0.09)",
//             filter: "blur(80px)",
//           }}
//         />
//       </div>

//       {/* ── Main content ──────────────────────────────────────────────── */}
//       <div
//         className={`max-w-[1060px] mx-auto ${isMobile ? "px-4 py-5" : "px-6 py-10"}`}
//       >
//         {/* ── AD BANNER — top of page ─────────────────────────────────── */}
//         <AnimatePresence>
//           {activeAd && !adDismissed && (
//             <AdBanner
//               ad={activeAd}
//               onDismiss={() => {
//                 setAdDismissed(true);
//                 setActiveAd(null);
//               }}
//             />
//           )}
//         </AnimatePresence>

//         {/* ①  NOT A MEMBER YET (REDESIGNED) ───────────────────────────── */}
//         {isBasicTier && <NonMemberBanner setPage={setPage} />}

//         {/* ②  GREETING ──────────────────────────────────────────────────── */}
//         <motion.header
//           initial={{ opacity: 0, y: -6 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.3, delay: 0.04 }}
//           className="mb-7"
//         >
//           <h1
//             className="font-semibold leading-tight text-foreground"
//             style={{ fontSize: isMobile ? 26 : 36 }}
//           >
//             {getGreeting()}, {firstName} 👋
//           </h1>
//           <p className="mt-2 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
//             <span
//               className="inline-flex items-center gap-1.5 font-medium"
//               style={{ color: "hsl(175 80% 44%)" }}
//             >
//               <MI icon="workspace_premium" size={14} />
//               {memberConfig.label} Member
//             </span>
//             <span className="text-muted-foreground">•</span>
//             <span>{user.goal}</span>
//           </p>
//         </motion.header>

//         {/* ③  EMAIL VERIFY BANNER ───────────────────────────────────────── */}
//         {showVerifyBanner && (
//           <motion.div
//             initial={{ opacity: 0, y: -8 }}
//             animate={{ opacity: 1, y: 0 }}
//             className="mb-5 rounded-xl border px-4 py-3 flex items-center justify-between gap-3"
//             style={{
//               borderColor: "hsl(38 92% 50% / 0.4)",
//               background: "hsl(38 92% 50% / 0.08)",
//             }}
//           >
//             <span
//               className="text-xs font-medium"
//               style={{ color: "hsl(38 92% 45%)" }}
//             >
//               Please verify your email to unlock all features. Check your Junk
//               or Spam folder if you don&apos;t see it.
//             </span>
//             <div className="flex items-center gap-2 shrink-0">
//               {resendSent ? (
//                 <span className="text-[10px] text-green-500 font-bold">
//                   Sent!
//                 </span>
//               ) : (
//                 <button
//                   onClick={resendVerification}
//                   disabled={resending}
//                   className="text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer"
//                   style={{
//                     border: "1px solid hsl(38 92% 50% / 0.4)",
//                     background: "hsl(38 92% 50% / 0.18)",
//                     color: "hsl(38 92% 45%)",
//                   }}
//                 >
//                   {resending ? "Sending…" : "Resend"}
//                 </button>
//               )}
//               <button
//                 onClick={() => setVerifyDismissed(true)}
//                 className="text-muted-foreground text-sm bg-transparent border-none cursor-pointer"
//               >
//                 ✕
//               </button>
//             </div>
//           </motion.div>
//         )}

//         {/* ⑤  3 BIG ACTION BUTTONS ──────────────────────────────────────── */}
//         <section className="mb-8 space-y-3">
//           {ACTION_BTNS.map((btn, i) => (
//             <motion.button
//               key={btn.label}
//               initial={{ opacity: 0, y: 10 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ delay: 0.12 + i * 0.08 }}
//               onClick={() => setPage(btn.page)}
//               className="group w-full rounded-2xl cursor-pointer transition-all active:scale-[0.98] hover:brightness-105 overflow-hidden text-left"
//               style={{
//                 background: btn.bg,
//                 boxShadow: btn.shadow,
//                 border: (btn as any).border ?? "none",
//               }}
//             >
//               <div className="flex items-center gap-4 px-5 py-4">
//                 <div
//                   className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
//                   style={{ background: btn.iconBg }}
//                 >
//                   <MI icon={btn.icon} size={24} />
//                 </div>
//                 <div className="flex-1">
//                   <div
//                     className="font-display text-lg font-bold uppercase tracking-wide leading-tight"
//                     style={{ color: btn.color }}
//                   >
//                     {btn.label}
//                   </div>
//                   <div
//                     className="text-xs mt-0.5"
//                     style={{ color: btn.color, opacity: 0.8 }}
//                   >
//                     {btn.sub}
//                   </div>
//                 </div>
//                 <span
//                   className="transition group-hover:translate-x-0.5"
//                   style={{ color: btn.color, opacity: 0.7 }}
//                 >
//                   <MI icon="chevron_right" size={22} />
//                 </span>
//               </div>
//             </motion.button>
//           ))}
//         </section>

//         {/* ⑥  MY PROGRESS ──────────────────────────────────────────────── */}
//         <motion.section
//           initial={{ opacity: 0, y: 8 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.36 }}
//           className="mb-8"
//         >
//           <SectionHead title="My Progress" />
//           <div
//             className="rounded-2xl p-4"
//             style={{
//               border: "1px solid hsl(var(--border))",
//               background: "hsl(var(--card))",
//             }}
//           >
//             <div className="grid grid-cols-3 gap-3">
//               <StatTile
//                 icon="bolt"
//                 label="Workouts"
//                 value={String(user.workouts.length)}
//                 tone="primary"
//               />
//               <StatTile
//                 icon="calendar_month"
//                 label="Classes / mo"
//                 value={String(user.bookings.length)}
//                 tone="teal"
//               />
//               <StatTile
//                 icon="where_to_vote"
//                 label="Check-ins"
//                 value={String(user.checkIns.length)}
//                 tone="success"
//               />
//             </div>
//             <div className="mt-4 grid grid-cols-3 gap-2">
//               {[
//                 { label: "PR Logbook", page: "PRLogbook" },
//                 { label: "Leaderboard", page: "Leaderboard" },
//                 { label: "Measure", page: "InBody" },
//               ].map((a) => (
//                 <button
//                   key={a.label}
//                   onClick={() => setPage(a.page)}
//                   className="rounded-xl py-2.5 text-xs font-medium text-foreground transition cursor-pointer"
//                   style={{
//                     border: "1px solid hsl(var(--border))",
//                     background: "hsl(var(--secondary))",
//                   }}
//                   onMouseEnter={(e) => {
//                     (e.currentTarget as HTMLButtonElement).style.borderColor =
//                       "hsl(175 80% 44% / 0.6)";
//                   }}
//                   onMouseLeave={(e) => {
//                     (e.currentTarget as HTMLButtonElement).style.borderColor =
//                       "hsl(var(--border))";
//                   }}
//                 >
//                   {a.label}
//                 </button>
//               ))}
//             </div>
//           </div>
//         </motion.section>

//         {/* ⑦  COMMUNITY (REDESIGNED) ─────────────────────────────────── */}
//         <CommunitySection liveNews={liveNews} setPage={setPage} />

//         {/* ⑧  NEWS & EVENTS (REDESIGNED SLIDER) ───────────────────────── */}
//         <motion.section
//           initial={{ opacity: 0, y: 8 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ delay: 0.48 }}
//           className="mb-8"
//         >
//           <SectionHead
//             title="News & Events"
//             action={{ label: "See all", onClick: () => setPage("News") }}
//           />
//           <NewsSlider items={newsToShow} onViewAll={() => setPage("News")} />
//         </motion.section>

//         {/* ── Footer (Admin + DSmart) ─────────────────────────────────── */}
//         <div className="mt-4 mb-6 flex flex-col items-center gap-3">
//           {/* Admin access — subtle, icon-only */}
//           <button
//             onClick={() => {
//               window.location.hash = "admin";
//               window.location.reload();
//             }}
//             className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-none cursor-pointer transition-opacity hover:opacity-80"
//             style={{
//               background: "hsl(var(--secondary))",
//               border: "1px solid hsl(var(--border))",
//             }}
//             title="Admin Panel"
//           >
//             <MI icon="admin_panel_settings" size={14} />
//             <span
//               className="text-[10px] font-bold uppercase tracking-widest"
//               style={{ color: "hsl(var(--muted-foreground))" }}
//             >
//               Admin
//             </span>
//           </button>

//           {/* Partner credit */}
//           <div className="flex items-center gap-2">
//             <span
//               className="text-[10px] uppercase tracking-widest font-bold"
//               style={{ color: "hsl(var(--muted-foreground))", opacity: 0.45 }}
//             >
//               Technology by
//             </span>
//             <a
//               href="https://www.dsmart.co.za"
//               target="_blank"
//               rel="noopener noreferrer"
//               className="no-underline hover:opacity-70 transition-opacity"
//             >
//               <div
//                 className="px-2.5 py-1 rounded-lg flex items-center"
//                 style={{
//                   background: "hsl(var(--secondary))",
//                   border: "1px solid hsl(var(--border))",
//                 }}
//               >
//                 <span
//                   className="font-display font-bold uppercase tracking-widest"
//                   style={{ fontSize: 11, color: "hsl(20 100% 50%)" }}
//                 >
//                   DSmart
//                 </span>
//               </div>
//             </a>
//           </div>
//         </div>
//       </div>

//       {/* ── FAB speed-dial ─────────────────────────────────────────────── */}
//       <div
//         className="pointer-events-none fixed z-40 flex flex-col items-end gap-2"
//         style={{ bottom: isMobile ? 88 : 24, right: 20 }}
//       >
//         <AnimatePresence>
//           {fabOpen && (
//             <motion.div
//               initial={{ opacity: 0, y: 8, scale: 0.95 }}
//               animate={{ opacity: 1, y: 0, scale: 1 }}
//               exit={{ opacity: 0, y: 8, scale: 0.95 }}
//               transition={{ duration: 0.15 }}
//               className="pointer-events-auto flex flex-col items-end gap-2"
//             >
//               {FAB_ACTIONS.map((a, i) => (
//                 <motion.button
//                   key={a.label}
//                   initial={{ opacity: 0, x: 8 }}
//                   animate={{ opacity: 1, x: 0 }}
//                   transition={{ delay: i * 0.04 }}
//                   onClick={() => {
//                     setFabOpen(false);
//                     setPage(a.page);
//                   }}
//                   className="flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold text-foreground cursor-pointer transition-all active:scale-95 whitespace-nowrap"
//                   style={{
//                     border: "1px solid hsl(var(--border))",
//                     background: "hsl(var(--card))",
//                     boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
//                   }}
//                 >
//                   <span style={{ color: "hsl(175 80% 44%)" }}>
//                     <MI icon={a.icon} size={16} />
//                   </span>
//                   {a.label}
//                 </motion.button>
//               ))}
//             </motion.div>
//           )}
//         </AnimatePresence>

//         <motion.button
//           onClick={() => setFabOpen((v) => !v)}
//           className="pointer-events-auto w-14 h-14 rounded-full border-none cursor-pointer flex items-center justify-center"
//           animate={{ rotate: fabOpen ? 45 : 0 }}
//           transition={{ type: "spring", stiffness: 400, damping: 28 }}
//           style={{
//             background: "hsl(20 100% 50%)",
//             color: "#000",
//             boxShadow: "0 12px 32px -8px hsl(20 100% 50% / 0.65)",
//           }}
//         >
//           <MI icon={fabOpen ? "close" : "add"} size={26} />
//         </motion.button>
//       </div>
//     </div>
//   );
// }
