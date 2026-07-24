import { useState, useEffect, useRef } from "react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { PageTitle } from "@/components/shared/PageTitle";
import { motion, AnimatePresence } from "framer-motion";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";

// ── Types ────────────────────────────────────────────────────────────────────

interface NewsItem {
  id: string;
  type: string;
  title: string;
  date: string;
  desc?: string;
  emoji?: string;
  imageUrl?: string;
  registrationLink?: string;
  registrationCutoff?: string;
  paymentLink?: string;
  status?: string;
  createdAt?: number;
}

// ── Fallback data ─────────────────────────────────────────────────────────────

const FALLBACK_NEWS: NewsItem[] = [
  {
    id: "1",
    type: "Event",
    title: "30-Day Transformation Challenge",
    date: "2026-04-01",
    desc: "Sign up for our biggest challenge. Track daily, earn double points, compete for 3-month free membership.",
    emoji: "🏆",
  },
  {
    id: "2",
    type: "News",
    title: "New Spin Studio Opens",
    date: "2026-03-20",
    desc: "Upgraded with 5 Technogym bikes, surround-sound, and a light show. Tuesday noon now fully booked.",
    emoji: "🚴",
  },
  {
    id: "3",
    type: "Event",
    title: "Charity Fun Run — 5km & 10km",
    date: "2026-04-12",
    desc: "Umgeni River Run raising funds for Riverside Youth Sports Trust. R80 entry includes race kit.",
    emoji: "🏃",
    registrationLink: "https://forms.gle/example",
    registrationCutoff: "2026-04-05",
    paymentLink: "https://payfast.io/example",
  },
  {
    id: "4",
    type: "News",
    title: "Coach Dlamini — SA Boxing Finals",
    date: "2026-03-08",
    desc: "Coach Dlamini placed 2nd at SA Amateur Boxing Championships in Cape Town. Celebrate with him Saturday!",
    emoji: "🥊",
  },
  {
    id: "5",
    type: "News",
    title: "Recovery Zone Now Open",
    date: "2026-03-01",
    desc: "Ice bath, sauna & stretch zone open. Members get 1 free session/week. Extra sessions R50.",
    emoji: "🛁",
  },
  {
    id: "6",
    type: "Event",
    title: "MK2 Family Day — April Braai",
    date: "2026-04-26",
    desc: "Bring the whole family! Kids fitness activities, live music, and the famous MK2 braai.",
    emoji: "🎉",
    registrationCutoff: "2026-04-20",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(raw: string): string {
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-").map(Number);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

function isCutoffPassed(cutoff: string): boolean {
  if (!cutoff) return false;
  return new Date(cutoff) < new Date();
}

// ── Swipe hook ────────────────────────────────────────────────────────────────

function useSwipe(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const startX = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const diff = startX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) onSwipeLeft();
      else onSwipeRight();
    }
    startX.current = null;
  };

  return { onTouchStart, onTouchEnd };
}

// ── NewsCard ──────────────────────────────────────────────────────────────────

function NewsCard({ n, index }: { n: NewsItem; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const SHORT_LIMIT = 100;
  const desc = n.desc ?? "";
  const isLong = desc.length > SHORT_LIMIT;
  const shortDesc = isLong ? desc.slice(0, SHORT_LIMIT).trimEnd() + "…" : desc;

  const formattedDate = formatDate(n.date);
  const formattedCutoff = n.registrationCutoff
    ? formatDate(n.registrationCutoff)
    : null;
  const cutoffPassed = isCutoffPassed(n.registrationCutoff ?? "");
  const hasRegistration = !!n.registrationLink;
  const hasPayment = !!n.paymentLink;
  const isEvent = n.type === "Event";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors"
      style={{ borderTop: "3px solid hsl(20 100% 50%)" }}
    >
      {/* Hero image */}
      {n.imageUrl && (
        <div className="w-full overflow-hidden">
          <img
            src={n.imageUrl}
            alt={n.title}
            className="w-full h-auto object-contain"
          />
        </div>
      )}

      {/* Card body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Type badge + emoji */}
        <div className="flex justify-between items-center">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{
              background: isEvent
                ? "hsl(20 100% 50% / 0.12)"
                : "hsl(0 0% 100% / 0.07)",
              color: isEvent ? "hsl(20 100% 50%)" : "hsl(0 0% 55%)",
              border: `1px solid ${isEvent ? "hsl(20 100% 50% / 0.25)" : "hsl(0 0% 20%)"}`,
            }}
          >
            {n.type}
          </span>
          {n.emoji && <span className="text-2xl">{n.emoji}</span>}
        </div>

        {/* Title */}
        <div className="font-display text-lg tracking-wide text-foreground leading-snug">
          {n.title}
        </div>

        {/* Date */}
        <div className="text-[11px] font-bold tracking-wide text-primary">
          📅 {formattedDate}
        </div>

        {/* Registration cutoff pill */}
        {isEvent && formattedCutoff && (
          <div>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: cutoffPassed
                  ? "hsl(0 72% 50% / 0.10)"
                  : "hsl(142 72% 37% / 0.10)",
                color: cutoffPassed ? "hsl(0 72% 55%)" : "hsl(142 72% 37%)",
                border: `1px solid ${cutoffPassed ? "hsl(0 72% 50% / 0.25)" : "hsl(142 72% 37% / 0.25)"}`,
              }}
            >
              {cutoffPassed ? "⏰" : "📋"}
              {cutoffPassed
                ? `Registration closed ${formattedCutoff}`
                : `Register by ${formattedCutoff}`}
            </span>
          </div>
        )}

        {/* Description */}
        {desc && (
          <div className="text-sm text-muted-foreground leading-relaxed flex-1 whitespace-pre-wrap">
            <AnimatePresence mode="wait">
              {expanded ? (
                <motion.span
                  key="full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {desc}
                </motion.span>
              ) : (
                <motion.span
                  key="short"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {shortDesc}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Learn More / Show Less */}
        {isLong && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="self-start text-[11px] font-bold uppercase tracking-wide text-primary bg-transparent border border-primary/40 rounded-lg px-3.5 py-1.5 cursor-pointer hover:bg-primary/5 transition-colors"
          >
            {expanded ? "Show Less ↑" : "Learn More ↓"}
          </button>
        )}

        {/* CTA buttons */}
        {isEvent && (hasRegistration || hasPayment) && (
          <div className="flex flex-wrap gap-2 pt-1 mt-auto">
            {hasRegistration && (
              <a
                href={n.registrationLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors"
                style={{
                  background: cutoffPassed
                    ? "hsl(0 0% 20%)"
                    : "hsl(20 100% 50%)",
                  color: cutoffPassed ? "hsl(0 0% 45%)" : "#000",
                  pointerEvents: cutoffPassed ? "none" : "auto",
                  cursor: cutoffPassed ? "not-allowed" : "pointer",
                  opacity: cutoffPassed ? 0.6 : 1,
                }}
                aria-disabled={cutoffPassed}
                tabIndex={cutoffPassed ? -1 : 0}
              >
                🎟 {cutoffPassed ? "Closed" : "Register"}
              </a>
            )}
            {hasPayment && (
              <a
                href={n.paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-colors hover:bg-white/5"
                style={{
                  border: "1px solid hsl(217 91% 53% / 0.5)",
                  color: "hsl(217 91% 65%)",
                }}
              >
                💳 Pay Now
              </a>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function NewsEvents() {
  const { isMobile } = useBreakpoint();
  const [filter, setFilter] = useState("All");
  const [adminNews, setAdminNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const swipeHandlers = useSwipe(
    () => setSwipeIndex((i) => Math.min(i + 1, filtered.length - 1)),
    () => setSwipeIndex((i) => Math.max(i - 1, 0)),
  );

  useEffect(() => {
    const newsRef = ref(db, "admin_news");
    const unsub = onValue(newsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        const list: NewsItem[] = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .filter((item) => item.status !== "draft");
        list.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        setAdminNews(list);
      } else {
        setAdminNews([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // const NEWS = adminNews.length > 0 ? adminNews : FALLBACK_NEWS;
  const NEWS = adminNews;
  const filters = ["All", ...Array.from(new Set(NEWS.map((n) => n.type)))];
  const filtered =
    filter === "All" ? NEWS : NEWS.filter((n) => n.type === filter);

  // Reset swipe index when filter changes
  useEffect(() => {
    setSwipeIndex(0);
  }, [filter]);

  return (
    <div
      className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
    >
      <PageTitle sub="What's happening at MK Two Rivers Fitness">
        News &amp; <span className="text-primary">Events</span>
      </PageTitle>

      {/* Live indicator */}
      {!loading && adminNews.length > 0 && (
        <div className="mb-4 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
          Live · {adminNews.length} post{adminNews.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full font-body font-bold text-[11px] uppercase tracking-wide cursor-pointer transition-all duration-150"
            style={{
              background: f === filter ? "hsl(20 100% 50%)" : "transparent",
              color: f === filter ? "#000" : "hsl(0 0% 50%)",
              border:
                f === filter
                  ? "1px solid hsl(20 100% 50%)"
                  : "1px solid hsl(0 0% 18%)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading news…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No posts yet.
        </div>
      ) : isMobile ? (
        // Mobile: swipeable single-card view
        <div
          {...swipeHandlers}
          className="relative overflow-hidden"
          style={{ touchAction: "pan-y" }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={filtered[swipeIndex]?.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.22 }}
            >
              <NewsCard n={filtered[swipeIndex]} index={0} />
            </motion.div>
          </AnimatePresence>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-4">
            {filtered.map((_, i) => (
              <button
                key={i}
                onClick={() => setSwipeIndex(i)}
                className="border-none cursor-pointer p-0 transition-all"
                style={{
                  width: i === swipeIndex ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background:
                    i === swipeIndex
                      ? "hsl(20 100% 50%)"
                      : "hsl(var(--border))",
                }}
              />
            ))}
          </div>

          {/* Prev / Next arrows */}
          <div className="flex justify-between mt-4 px-1">
            <button
              onClick={() => setSwipeIndex((i) => Math.max(i - 1, 0))}
              disabled={swipeIndex === 0}
              className="text-xs font-bold px-4 py-2 rounded-xl border-none cursor-pointer transition-all disabled:opacity-30"
              style={{
                background: "hsl(var(--secondary))",
                color: "hsl(var(--foreground))",
              }}
            >
              ← Prev
            </button>
            <span className="text-xs text-muted-foreground self-center">
              {swipeIndex + 1} / {filtered.length}
            </span>
            <button
              onClick={() =>
                setSwipeIndex((i) => Math.min(i + 1, filtered.length - 1))
              }
              disabled={swipeIndex === filtered.length - 1}
              className="text-xs font-bold px-4 py-2 rounded-xl border-none cursor-pointer transition-all disabled:opacity-30"
              style={{
                background: "hsl(var(--secondary))",
                color: "hsl(var(--foreground))",
              }}
            >
              Next →
            </button>
          </div>
        </div>
      ) : (
        // Desktop: grid layout
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filtered.map((n, i) => (
            <NewsCard key={n.id} n={n} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// import { useState, useEffect } from "react";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { PageTitle } from "@/components/shared/PageTitle";
// import { motion, AnimatePresence } from "framer-motion";
// import { ref, onValue } from "firebase/database";
// import { db } from "@/lib/firebase";

// // ── Types ────────────────────────────────────────────────────────────────────

// interface NewsItem {
//   id: string;
//   type: string;
//   title: string;
//   date: string;
//   desc?: string;
//   emoji?: string;
//   imageUrl?: string;
//   registrationLink?: string;
//   registrationCutoff?: string;
//   paymentLink?: string;
// }

// // ── Fallback data (no imageUrl / event fields — kept for offline dev) ────────

// const FALLBACK_NEWS: NewsItem[] = [
//   {
//     id: "1",
//     type: "Event",
//     title: "30-Day Transformation Challenge",
//     date: "2026-04-01",
//     desc: "Sign up for our biggest challenge. Track daily, earn double points, compete for 3-month free membership.",
//     emoji: "🏆",
//     registrationLink: "",
//     registrationCutoff: "",
//     paymentLink: "",
//   },
//   {
//     id: "2",
//     type: "News",
//     title: "New Spin Studio Opens",
//     date: "2026-03-20",
//     desc: "Upgraded with 5 Technogym bikes, surround-sound, and a light show. Tuesday noon now fully booked.",
//     emoji: "🚴",
//   },
//   {
//     id: "3",
//     type: "Event",
//     title: "Charity Fun Run — 5km & 10km",
//     date: "2026-04-12",
//     desc: "Umgeni River Run raising funds for Riverside Youth Sports Trust. R80 entry includes race kit.",
//     emoji: "🏃",
//     registrationLink: "https://forms.gle/example",
//     registrationCutoff: "2026-04-05",
//     paymentLink: "https://payfast.io/example",
//   },
//   {
//     id: "4",
//     type: "News",
//     title: "Coach Dlamini — SA Boxing Finals",
//     date: "2026-03-08",
//     desc: "Coach Dlamini placed 2nd at SA Amateur Boxing Championships in Cape Town. Celebrate with him Saturday!",
//     emoji: "🥊",
//   },
//   {
//     id: "5",
//     type: "News",
//     title: "Recovery Zone Now Open",
//     date: "2026-03-01",
//     desc: "Ice bath, sauna & stretch zone open. Members get 1 free session/week. Extra sessions R50.",
//     emoji: "🛁",
//   },
//   {
//     id: "6",
//     type: "Event",
//     title: "MK2 Family Day — April Braai",
//     date: "2026-04-26",
//     desc: "Bring the whole family! Kids fitness activities, live music, and the famous MK2 braai.",
//     emoji: "🎉",
//     registrationLink: "",
//     registrationCutoff: "2026-04-20",
//     paymentLink: "",
//   },
// ];

// // ── Helpers ──────────────────────────────────────────────────────────────────

// /** Format "2026-04-12" → "12 Apr 2026" */
// function formatDate(raw: string): string {
//   if (!raw) return "";
//   // Already formatted (e.g. fallback strings like "1 Apr 2026")
//   if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
//   const [y, m, d] = raw.split("-").map(Number);
//   const months = [
//     "Jan", "Feb", "Mar", "Apr", "May", "Jun",
//     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
//   ];
//   return `${d} ${months[m - 1]} ${y}`;
// }

// /** Returns true if the cutoff date has already passed */
// function isCutoffPassed(cutoff: string): boolean {
//   if (!cutoff) return false;
//   return new Date(cutoff) < new Date();
// }

// function typeBadgeStyle(type: string): React.CSSProperties {
//   const isEvent = type === "Event";
//   return {
//     display: "inline-block",
//     fontSize: 10,
//     fontWeight: 700,
//     letterSpacing: "0.07em",
//     textTransform: "uppercase" as const,
//     padding: "3px 10px",
//     borderRadius: 20,
//     background: isEvent ? "hsl(20 100% 50% / 0.12)" : "hsl(0 0% 100% / 0.07)",
//     color: isEvent ? "hsl(20 100% 50%)" : "hsl(0 0% 60%)",
//     border: `1px solid ${isEvent ? "hsl(20 100% 50% / 0.25)" : "hsl(0 0% 20%)"}`,
//   };
// }

// // ── NewsCard ─────────────────────────────────────────────────────────────────

// function NewsCard({ n, index }: { n: NewsItem; index: number }) {
//   const [expanded, setExpanded] = useState(false);

//   const SHORT_LIMIT = 100;
//   const desc = n.desc ?? "";
//   const isLong = desc.length > SHORT_LIMIT;
//   const shortDesc = isLong ? desc.slice(0, SHORT_LIMIT).trimEnd() + "…" : desc;

//   const formattedDate = formatDate(n.date);
//   const formattedCutoff = n.registrationCutoff
//     ? formatDate(n.registrationCutoff)
//     : null;
//   const cutoffPassed = isCutoffPassed(n.registrationCutoff ?? "");

//   const hasRegistration = !!n.registrationLink;
//   const hasPayment = !!n.paymentLink;
//   const isEvent = n.type === "Event";

//   return (
//     <motion.div
//       key={n.id}
//       initial={{ opacity: 0, y: 10 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ delay: index * 0.06 }}
//       className="mk2-card flex flex-col overflow-hidden"
//       style={{ borderTop: "3px solid hsl(20 100% 50%)", padding: 0 }}
//     >
//       {/* ── Hero image ──────────────────────────────────────────────────── */}
//       {n.imageUrl && (
//         <div className="w-full overflow-hidden" style={{ height: 160 }}>
//           <img
//             src={n.imageUrl}
//             alt={n.title}
//             className="w-full h-full object-cover"
//             style={{ display: "block" }}
//           />
//         </div>
//       )}

//       {/* ── Card body ───────────────────────────────────────────────────── */}
//       <div className="flex flex-col flex-1 p-4">
//         {/* Header row: badge + emoji (emoji only for fallback items) */}
//         <div className="flex justify-between items-start mb-3">
//           <span style={typeBadgeStyle(n.type)}>{n.type}</span>
//           {n.emoji && (
//             <span className="text-[22px] leading-none">{n.emoji}</span>
//           )}
//         </div>

//         {/* Title */}
//         <div className="font-display text-lg tracking-wide mb-1 text-foreground">
//           {n.title}
//         </div>

//         {/* Event date */}
//         <div className="text-[11px] font-bold tracking-[0.06em] mb-2 text-primary">
//           {formattedDate}
//         </div>

//         {/* Registration cutoff pill (events only) */}
//         {isEvent && formattedCutoff && (
//           <div className="mb-3">
//             <span
//               className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full"
//               style={{
//                 background: cutoffPassed
//                   ? "hsl(0 72% 50% / 0.12)"
//                   : "hsl(142 72% 37% / 0.10)",
//                 color: cutoffPassed
//                   ? "hsl(0 72% 55%)"
//                   : "hsl(142 72% 37%)",
//                 border: `1px solid ${cutoffPassed ? "hsl(0 72% 50% / 0.25)" : "hsl(142 72% 37% / 0.25)"}`,
//               }}
//             >
//               {cutoffPassed ? "⏰" : "📅"}
//               {cutoffPassed
//                 ? `Registration closed ${formattedCutoff}`
//                 : `Register by ${formattedCutoff}`}
//             </span>
//           </div>
//         )}

//         {/* Description */}
//         {desc && (
//           <div className="text-sm text-muted-foreground leading-relaxed mb-3 flex-1">
//             <AnimatePresence mode="wait">
//               {expanded ? (
//                 <motion.span
//                   key="full"
//                   initial={{ opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   exit={{ opacity: 0 }}
//                   transition={{ duration: 0.2 }}
//                 >
//                   {desc}
//                 </motion.span>
//               ) : (
//                 <motion.span
//                   key="short"
//                   initial={{ opacity: 0 }}
//                   animate={{ opacity: 1 }}
//                   exit={{ opacity: 0 }}
//                   transition={{ duration: 0.2 }}
//                 >
//                   {shortDesc}
//                 </motion.span>
//               )}
//             </AnimatePresence>
//           </div>
//         )}

//         {/* Learn More / Show Less */}
//         {isLong && (
//           <button
//             onClick={() => setExpanded((v) => !v)}
//             className="self-start bg-transparent border border-primary text-primary rounded-md px-3.5 py-1.5 text-[11px] font-bold font-body cursor-pointer uppercase tracking-wide hover:bg-primary/5 transition-colors mb-3"
//           >
//             {expanded ? "Show Less ↑" : "Learn More ↓"}
//           </button>
//         )}

//         {/* ── CTA buttons ─────────────────────────────────────────────── */}
//         {isEvent && (hasRegistration || hasPayment) && (
//           <div className="flex flex-wrap gap-2 mt-auto pt-1">
//             {hasRegistration && (
//               <a
//                 href={n.registrationLink}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] font-bold font-body uppercase tracking-wide transition-colors"
//                 style={{
//                   background: cutoffPassed
//                     ? "hsl(0 0% 20%)"
//                     : "hsl(20 100% 50%)",
//                   color: cutoffPassed ? "hsl(0 0% 45%)" : "#000",
//                   pointerEvents: cutoffPassed ? "none" : "auto",
//                   cursor: cutoffPassed ? "not-allowed" : "pointer",
//                   opacity: cutoffPassed ? 0.6 : 1,
//                 }}
//                 aria-disabled={cutoffPassed}
//                 tabIndex={cutoffPassed ? -1 : 0}
//               >
//                 🎟 {cutoffPassed ? "Closed" : "Register"}
//               </a>
//             )}
//             {hasPayment && (
//               <a
//                 href={n.paymentLink}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[11px] font-bold font-body uppercase tracking-wide border transition-colors hover:bg-white/5"
//                 style={{
//                   border: "1px solid hsl(217 91% 53% / 0.5)",
//                   color: "hsl(217 91% 65%)",
//                 }}
//               >
//                 💳 Pay Now
//               </a>
//             )}
//           </div>
//         )}
//       </div>
//     </motion.div>
//   );
// }

// // ── Page ─────────────────────────────────────────────────────────────────────

// export function NewsEvents() {
//   const { isMobile } = useBreakpoint();
//   const [filter, setFilter] = useState("All");
//   const [adminNews, setAdminNews] = useState<NewsItem[]>([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     const newsRef = ref(db, "admin_news");
//     const unsub = onValue(newsRef, (snap) => {
//       if (snap.exists()) {
//         const data = snap.val();
//         const list: NewsItem[] = Object.entries(data).map(
//           ([id, val]: [string, any]) => ({ id, ...val })
//         );
//         // Newest first (by createdAt if present, otherwise reverse insertion order)
//         list.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
//         setAdminNews(list);
//       } else {
//         setAdminNews([]);
//       }
//       setLoading(false);
//     });
//     return () => unsub();
//   }, []);

//   const NEWS = adminNews.length > 0 ? adminNews : FALLBACK_NEWS;
//   const filters = ["All", ...Array.from(new Set(NEWS.map((n) => n.type)))];
//   const filtered =
//     filter === "All" ? NEWS : NEWS.filter((n) => n.type === filter);

//   return (
//     <div
//       className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
//     >
//       <PageTitle sub="What's happening at MK Two Rivers Fitness">
//         News &amp; <span className="text-primary">Events</span>
//       </PageTitle>

//       {/* Live indicator */}
//       {!loading && adminNews.length > 0 && (
//         <div className="mb-4 text-[11px] text-muted-foreground flex items-center gap-1.5">
//           <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
//           Live updates from admin ({adminNews.length} posts)
//         </div>
//       )}

//       {/* Filter tabs */}
//       <div className="flex gap-2 mb-6 flex-wrap">
//         {filters.map((f) => (
//           <button
//             key={f}
//             onClick={() => setFilter(f)}
//             className="px-4 py-1.5 rounded-full font-body font-bold text-[11px] uppercase tracking-wide cursor-pointer transition-all duration-150"
//             style={{
//               background: f === filter ? "hsl(20 100% 50%)" : "transparent",
//               color: f === filter ? "#000" : "hsl(0 0% 50%)",
//               border:
//                 f === filter
//                   ? "1px solid hsl(20 100% 50%)"
//                   : "1px solid hsl(0 0% 18%)",
//             }}
//           >
//             {f}
//           </button>
//         ))}
//       </div>

//       {loading ? (
//         <div className="text-center py-12 text-muted-foreground text-sm">
//           Loading news…
//         </div>
//       ) : filtered.length === 0 ? (
//         <div className="text-center py-12 text-muted-foreground text-sm">
//           No posts yet.
//         </div>
//       ) : (
//         <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
//           {filtered.map((n, i) => (
//             <NewsCard key={n.id} n={n} index={i} />
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }
