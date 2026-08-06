import { type ReactNode, useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { Toast } from "@/components/shared/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";

function MI({ icon, size = 22 }: { icon: string; size?: number }) {
  return (
    <span
      className="material-symbols-rounded"
      style={{ fontSize: size, lineHeight: 1, userSelect: "none" }}
    >
      {icon}
    </span>
  );
}

// ── Desktop nav groups ────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Main",
    tabs: [
      { id: "Dashboard", label: "Home" },
      { id: "Checkin", label: "Check-In" },
      { id: "Leaderboard", label: "Leaderboard" },
    ],
  },
  {
    label: "Tools",
    tabs: [
      { id: "BMR", label: "BMR Calculator" },
      { id: "WorkoutPlanner", label: "AI Workout Planner" },
      { id: "Nutrition", label: "AI Nutrition Coach" },
      { id: "InBody", label: "InBody Assessments" },
      { id: "Progress", label: "Progress Report" },
    ],
  },
  {
    label: "Gym",
    tabs: [
      { id: "Classes", label: "Classes" },
      { id: "Membership", label: "Membership" },
      { id: "Community", label: "Community" },
      { id: "Gallery", label: "Gallery" },
      { id: "News", label: "News" },
      { id: "PRLogbook", label: "PR Logbook" },
      { id: "About", label: "About Us" },
      { id: "Contact", label: "Contact" },
      { id: "Terms", label: "T&Cs" },
      { id: "Privacy", label: "Privacy Policy" },
      { id: "Advertise", label: "Advertise" },
    ],
  },
];

// ── Mobile bottom nav — HOME | CLASSES | TOOLS | GALLERY | MORE ──────────────
const BOTTOM_TABS = [
  { id: "Dashboard", icon: "home", label: "Home" },
  { id: "Classes", icon: "calendar_month", label: "Classes" },
  { id: "Tools", icon: "auto_awesome", label: "Tools" },
  { id: "Gallery", icon: "photo_library", label: "Gallery" },
  { id: "__more__", icon: "menu", label: "More" },
];

// ── TOOL_PAGES — exported so Toolscreen.tsx can import it ────────────────────
export const TOOL_PAGES = [
  { id: "BMR", label: " BMR Calculator" },
  { id: "WorkoutPlanner", label: " AI Workout Planner" },
  { id: "Nutrition", label: " AI Nutrition Coach" },
  { id: "InBody", label: " InBody Assessment" },
  { id: "Progress", label: " Progress Report" },
];

// ── More drawer ───────────────────────────────────────────────────────────────
// Tools and Gallery are now direct bottom tabs, so they are intentionally
// excluded from the More drawer to avoid redundancy.

const MORE_GYM = [
  { id: "Checkin", label: "Gym Check-In" },
  { id: "Leaderboard", label: " Leaderboard" },
  { id: "PRLogbook", label: " PR Logbook" },
  { id: "Community", label: " Community" },
  { id: "News", label: " News & Events" },
  { id: "Membership", label: " Membership" },
  { id: "Account", label: " My Account" },
];

const MORE_SETTINGS = [
  { id: "NotificationSettings", label: "🔔 Notifications" },
  { id: "About", label: "About Us" },
  { id: "Contact", label: "Contact Us" },
  { id: "Advertise", label: "📣 Advertise" },
  { id: "Terms", label: "T&Cs" },
  { id: "Privacy", label: "Privacy Policy" },
];

interface LayoutProps {
  children: ReactNode;
  page: string;
  setPage: (page: string) => void;
}

export function Layout({ children, page, setPage }: LayoutProps) {
  const { user, toastData, clearToast } = useAuth();
  const { isMobile } = useBreakpoint();
  const [showMore, setShowMore] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `users/${user.uid}/notifications`), (snap) => {
      if (!snap.exists()) {
        setUnreadCount(0);
        return;
      }
      const items = Object.values(snap.val()) as any[];
      setUnreadCount(items.filter((n) => !n.read).length);
    });
  }, [user]);

  // ─── Fix 1: Prevent body scroll shift when drawer opens ──────────────
  useEffect(() => {
    if (showMore) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflowY = "scroll";
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflowY = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflowY = "";
    };
  }, [showMore]);

  const navigate = (id: string) => {
    setPage(id);
    setShowMore(false);
    setActiveGroup(null);
  };

  if (!user) return null;

  // Real tab ids (excludes __more__)
  const realTabIds = BOTTOM_TABS.filter((t) => t.id !== "__more__").map(
    (t) => t.id,
  );
  const isMoreActive = showMore || !realTabIds.includes(page);

  return (
    <div
      className="min-h-screen bg-background text-foreground font-body"
      style={{ overflowX: "hidden", maxWidth: "100vw" }}
    >
      {/* ── Desktop nav ────────────────────────────────────────────────── */}
      {!isMobile && (
        <nav className="sticky top-0 z-[200] bg-background/95 backdrop-blur-xl border-b border-border px-5 h-[58px] flex items-center justify-between gap-4">
          {/* Logo */}
          <div
            onClick={() => navigate("Dashboard")}
            className="flex items-center gap-2.5 cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src="/mk2r-logo.jpg"
              alt="MK2R Fitness"
              style={{
                width: 40,
                height: 40,
                objectFit: "contain",
                borderRadius: 8,
              }}
            />
            <div>
              <div className="font-display text-[22px] tracking-[0.15em] text-primary leading-none">
                MK2 RIVERS
              </div>
              <div className="font-display text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
                Gym Pro
              </div>
            </div>
          </div>

          {/* Nav groups */}
          <div className="flex items-center gap-1 flex-1 justify-center">
            {NAV_GROUPS.map((group) => {
              const groupActive = group.tabs.some((t) => t.id === page);
              const isOpen = activeGroup === group.label;
              return (
                <div key={group.label} className="relative">
                  <button
                    onClick={() => setActiveGroup(isOpen ? null : group.label)}
                    onBlur={() => setTimeout(() => setActiveGroup(null), 150)}
                    className={`px-3 py-1.5 rounded-md border-none cursor-pointer font-body font-bold text-[11px] uppercase tracking-wide transition-all duration-150 flex items-center gap-1.5 ${
                      groupActive
                        ? "bg-primary/15 text-primary"
                        : "bg-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {group.label}
                    {group.label === "Tools" && (
                      <span className="text-[8px] bg-primary text-primary-foreground px-1 py-0.5 rounded-full font-bold">
                        NEW
                      </span>
                    )}
                    <span className="text-[8px] opacity-60">▼</span>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-full left-0 mt-1 bg-card border border-border rounded-xl shadow-2xl overflow-hidden min-w-[160px] z-50 max-h-[400px] overflow-y-auto"
                      >
                        {group.tabs.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => navigate(tab.id)}
                            className={`w-full px-4 py-2.5 text-left border-none cursor-pointer font-body font-medium text-xs transition-colors duration-100 ${
                              page === tab.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-transparent text-foreground hover:bg-secondary"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              onClick={() => navigate("NotificationsInbox")}
              className="relative w-9 h-9 flex items-center justify-center rounded-full bg-secondary border border-border cursor-pointer hover:border-primary/40 transition-colors"
            >
              <MI icon="notifications" size={18} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: "hsl(20 100% 50%)", color: "#000" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <div
              onClick={() => navigate("Account")}
              className="flex items-center gap-2 bg-secondary border border-border rounded-full py-1 pl-1.5 pr-3 cursor-pointer hover:border-primary/40 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-display text-sm"
                style={{ background: user.color, color: "#000" }}
              >
                {user.name[0]}
              </div>
              <span
                className={`text-xs font-bold ${page === "Account" ? "text-primary" : "text-foreground"}`}
              >
                {user.name.split(" ")[0]}
              </span>
            </div>
          </div>
        </nav>
      )}

      {/* ── Mobile top bar ─────────────────────────────────────────────── */}
      {isMobile && (
        <div
          className="sticky top-0 z-[200] bg-background/97 border-b border-border px-4 flex items-center justify-between"
          style={{
            paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
            paddingBottom: "12px",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src="/mk2r-logo.jpg"
              alt="MK2R Fitness"
              style={{
                width: 38,
                height: 38,
                objectFit: "contain",
                borderRadius: 7,
              }}
            />
            <div>
              <div className="font-display text-xl tracking-[0.15em] text-primary leading-tight">
                MK2 RIVERS
              </div>
              <div className="font-display text-[9px] tracking-[0.15em] text-muted-foreground uppercase">
                Gym Pro
              </div>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => navigate("NotificationsInbox")}
              className="relative w-8 h-8 flex items-center justify-center rounded-full bg-secondary border border-border cursor-pointer"
            >
              <MI icon="notifications" size={18} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: "hsl(20 100% 50%)", color: "#000" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <div
              onClick={() => navigate("Account")}
              className="w-8 h-8 rounded-full flex items-center justify-center font-display text-[15px] cursor-pointer"
              style={{ background: user.color, color: "#000" }}
            >
              {user.name[0]}
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ───────────────────────────────────────────────── */}
      {/* Fix 2: Remove y:6 to avoid reflow jump */}
      <motion.div
        key={page}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={
          isMobile
            ? { paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }
            : undefined
        }
      >
        {children}
      </motion.div>

      {/* ── Partner footer ─────────────────────────────────────────────── */}
      <div
        className="w-full flex items-center justify-center gap-3 py-4 px-4"
        style={{
          borderTop: "1px solid hsl(var(--border))",
          marginTop: "auto",
          paddingBottom: isMobile
            ? "calc(80px + env(safe-area-inset-bottom, 0px))"
            : "1.5rem",
        }}
      >
        <span
          className="text-[10px] uppercase tracking-widest font-bold"
          style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }}
        >
          Technology powered by
        </span>
        <a
          href="https://www.dsmart.co.za"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 no-underline group transition-opacity hover:opacity-80"
        >
          <div
            className="flex items-center justify-center rounded-lg px-2.5 py-1"
            style={{
              background: "hsl(var(--secondary))",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <span
              className="font-display font-bold tracking-widest uppercase"
              style={{
                fontSize: 11,
                color: "hsl(20 100% 50%)",
                letterSpacing: "0.15em",
              }}
            >
              DSmart
            </span>
          </div>
        </a>
      </div>

      {/* ── Mobile bottom nav — Home | Classes | Tools | Gallery | More ── */}
      {isMobile && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-[200] bg-background/98 border-t border-border flex backdrop-blur-xl"
          style={{
            height: "calc(64px + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {BOTTOM_TABS.map((t) => {
            const isMore = t.id === "__more__";
            const active = isMore ? isMoreActive : page === t.id && !showMore;

            return (
              <button
                key={t.id}
                onClick={() => {
                  if (isMore) {
                    setShowMore((v) => !v);
                  } else {
                    setShowMore(false);
                    navigate(t.id);
                  }
                }}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer transition-colors duration-150"
              >
                <div className="relative flex items-center justify-center">
                  {active && (
                    <motion.div
                      layoutId="tab-indicator"
                      layout="position"
                      className="absolute rounded-full"
                      style={{
                        background: "hsl(20 100% 50% / 0.15)",
                        width: 36,
                        height: 36,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <MI icon={t.icon} size={22} />
                </div>
                <span
                  className="text-[9px] font-body font-bold tracking-[0.06em] uppercase"
                  style={{
                    color: active
                      ? "hsl(20 100% 50%)"
                      : "hsl(var(--muted-foreground))",
                  }}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ── More drawer ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isMobile && showMore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[201] bg-black/80 flex items-end"
            onClick={() => setShowMore(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="w-full bg-card rounded-t-2xl border border-border overflow-y-auto"
              style={{
                maxHeight: "82vh",
                paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div
                  className="rounded-full"
                  style={{
                    width: 36,
                    height: 4,
                    background: "hsl(var(--border))",
                  }}
                />
              </div>

              <div className="px-5 pt-3 pb-2">
                {/* ── Gym ─────────────────────────────────────────────── */}
                <div className="mb-5">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Gym
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MORE_GYM.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(p.id)}
                        className={`bg-secondary border rounded-xl p-3.5 font-body font-bold text-sm text-foreground cursor-pointer text-left transition-colors active:scale-95 ${
                          page === p.id
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Settings & Info ──────────────────────────────────── */}
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">
                    Settings & Info
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {MORE_SETTINGS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => navigate(p.id)}
                        className={`bg-secondary border rounded-xl p-3.5 font-body font-bold text-sm text-foreground cursor-pointer text-left transition-colors active:scale-95 ${
                          page === p.id
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toastData && (
        <Toast
          msg={toastData.msg}
          type={toastData.type}
          onDone={clearToast}
          onTap={toastData.onTap}
        />
      )}
    </div>
  );
}

