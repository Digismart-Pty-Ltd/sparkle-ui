import { useState } from "react";
import { useAuth, type MK2User } from "@/context/AuthContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  auth,
  db,
  fetchUser,
  logEvent,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "@/lib/firebase";
import { saveUser } from "@/lib/firebase";
import { GOALS, LEVELS, ACCENT_COLORS } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import { requestNotificationPermission } from "@/lib/firebase-messaging";
import { listenForForegroundMessages } from "@/lib/firebase-messaging";
import { sendPasswordResetEmail, sendEmailVerification } from "firebase/auth";
import { ref, set, push } from "firebase/database";

// ── Inline doc overlay — renders Terms or Privacy without needing router ──────
function DocOverlay({
  title,
  onClose,
}: {
  title: "Terms & Conditions" | "Privacy Policy";
  onClose: () => void;
}) {
  const isTerms = title === "Terms & Conditions";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: "#0a0a0a",
          border: "1px solid rgba(255,255,255,0.08)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div
            className="font-display text-base tracking-[0.1em] uppercase"
            style={{ color: "hsl(20 100% 50%)" }}
          >
            {title}
          </div>
          <button
            onClick={onClose}
            className="border-none bg-transparent cursor-pointer text-sm font-bold"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            ✕ Close
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-5 py-4 text-xs leading-relaxed flex-1"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {isTerms ? (
            <>
              <p className="mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                Last updated: March 2026
              </p>
              {[
                {
                  heading: "1. Membership & Access",
                  body: "Membership grants you access to MK2 Rivers Fitness facilities and digital services during operating hours. Membership is personal and non-transferable. MK2 Rivers reserves the right to refuse or revoke access at its discretion.",
                },
                {
                  heading: "2. Health & Safety",
                  body: "By registering, you confirm that you are in good health and aware of the risks associated with physical exercise. MK2 Rivers Fitness is not liable for any injury, illness, or loss sustained on the premises or as a result of using our digital training tools.",
                },
                {
                  heading: "3. Code of Conduct",
                  body: "Members must behave respectfully toward staff and fellow members at all times. Harassment, intimidation, theft, or damage to property will result in immediate termination of membership without refund.",
                },
                {
                  heading: "4. Payments & Cancellations",
                  body: "Membership fees are charged monthly in advance. Cancellations require 30 days' written notice. No refunds are issued for unused portions of any billing period. Class credits and loyalty rewards have no cash value.",
                },
                {
                  heading: "5. Digital Services",
                  body: "AI-powered tools (Workout Planner, Nutrition Coach, etc.) are provided for informational purposes only and do not constitute medical or professional advice. Always consult a qualified professional before making changes to your health routine.",
                },
                {
                  heading: "6. Privacy",
                  body: "Your personal data is processed in accordance with our Privacy Policy. By registering, you consent to the collection and use of your data as described therein.",
                },
                {
                  heading: "7. Changes to Terms",
                  body: "MK2 Rivers Fitness may update these Terms at any time. Continued use of the app or facilities after changes constitutes acceptance of the revised Terms.",
                },
              ].map((s) => (
                <div key={s.heading} className="mb-4">
                  <div
                    className="font-bold mb-1 text-[11px] uppercase tracking-wider"
                    style={{ color: "hsl(20 100% 50%)" }}
                  >
                    {s.heading}
                  </div>
                  <p>{s.body}</p>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className="mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                Last updated: March 2026
              </p>
              {[
                {
                  heading: "1. What We Collect",
                  body: "We collect your name, email address, fitness goal, training level, check-in history, workout logs, and usage data within the app. We do not collect payment card details — payments are handled by secure third-party processors.",
                },
                {
                  heading: "2. How We Use Your Data",
                  body: "Your data is used to personalise your experience, power AI training tools, track loyalty rewards, send relevant notifications, and improve our services. We do not sell your data to third parties.",
                },
                {
                  heading: "3. Data Storage",
                  body: "Data is stored securely via Google Firebase, hosted in data centres that comply with international security standards. Data may be stored outside South Africa in accordance with POPIA cross-border transfer requirements.",
                },
                {
                  heading: "4. Your Rights (POPIA)",
                  body: "Under the Protection of Personal Information Act (POPIA), you have the right to access, correct, or request deletion of your personal information at any time. Contact us at mk2riversfitness@gmail.com to exercise these rights.",
                },
                {
                  heading: "5. Notifications",
                  body: "With your permission, we may send push notifications about class bookings, check-in reminders, rewards, and news. You can disable notifications at any time in your device or app settings.",
                },
                {
                  heading: "6. Cookies & Analytics",
                  body: "We use Firebase Analytics to understand how members use the app. No personally identifiable information is shared with analytics providers beyond anonymised usage data.",
                },
                {
                  heading: "7. Contact",
                  body: "For privacy-related queries, contact us at mk2riversfitness@gmail.com or visit us at MK2 Rivers Fitness, Ruimsig, Johannesburg.",
                },
              ].map((s) => (
                <div key={s.heading} className="mb-4">
                  <div
                    className="font-bold mb-1 text-[11px] uppercase tracking-wider"
                    style={{ color: "hsl(187 100% 40%)" }}
                  >
                    {s.heading}
                  </div>
                  <p>{s.body}</p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer CTA */}
        <div
          className="px-5 py-4 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer transition hover:brightness-105"
            style={{ background: "hsl(20 100% 50%)", color: "#000" }}
          >
            Got it — close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const heights: Record<string, number> = { sm: 36, md: 52, lg: 72 };
  const [imgError, setImgError] = useState(false);
  if (!imgError) {
    return (
      <img
        src="/mk2r-logo.jpg"
        alt="MK2 Rivers Fitness"
        height={heights[size]}
        style={{ height: heights[size], width: "auto", objectFit: "contain" }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div>
      <div
        className="font-display tracking-[0.2em] text-white leading-none"
        style={{ fontSize: heights[size] * 0.45 }}
      >
        MK2 RIVERS
      </div>
      <div
        className="text-[9px] tracking-[0.25em] uppercase"
        style={{ color: "hsl(187 100% 40%)" }}
      >
        FITNESS HUB
      </div>
    </div>
  );
}

// ── AuthScreen ────────────────────────────────────────────────────────────────
interface AuthScreenProps {
  setPage?: (page: string) => void;
}

export function AuthScreen({ setPage }: AuthScreenProps) {
  const { isMobile } = useBreakpoint();
  const { setUser, toast } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [level, setLevel] = useState(LEVELS[1]);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // ── Doc overlay state — null = closed ────────────────────────────────────
  const [docOpen, setDocOpen] = useState<
    "Terms & Conditions" | "Privacy Policy" | null
  >(null);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = async () => {
    if (!email || !pw) return toast("Fill in all fields", "error");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
      const userData = await fetchUser(cred.user.uid);
      logEvent("login", { method: "email" });
      const normalized = {
        ...userData,
        workouts: Array.isArray((userData as any).workouts)
          ? (userData as any).workouts
          : [],
        bookings: Array.isArray((userData as any).bookings)
          ? (userData as any).bookings
          : [],
        weights: Array.isArray((userData as any).weights)
          ? (userData as any).weights
          : [],
        checkIns: Array.isArray((userData as any).checkIns)
          ? (userData as any).checkIns
          : [],
        points: (userData as any).points ?? 0,
        // App subscription tier — self-service, safe to default. This does
        // NOT touch `membership` (the gym contract tier), which must stay
        // exactly whatever the gym admin has (or hasn't) set it to.
        appMembership: (userData as any).appMembership ?? "basic",
      };
      setUser(normalized as MK2User);
      toast(`Welcome back, ${(userData as any).name}! 💪`, "success");
    } catch (e: any) {
      toast(
        e.code === "auth/invalid-credential"
          ? "Wrong email or password."
          : e.message,
        "error",
      );
    }
    setLoading(false);
  };

  // ── Register ──────────────────────────────────────────────────────────────
  const register = async () => {
    if (!email || !pw || !name) return toast("Fill in all fields", "error");
    if (pw.length < 6) return toast("Password needs 6+ characters", "error");
    if (!agreedToTerms)
      return toast("Please accept the Terms & Conditions to continue", "error");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      const uid = cred.user.uid;

      // ── Gym contract vs app subscription ─────────────────────────────────
      // `membership` (gym contract tier — u18/hybrid_*/unlimited_*) is
      // intentionally OMITTED here. It must stay unset until a gym admin
      // manually assigns it in the admin panel once a signed contract
      // exists — the app has no way of knowing that on its own, and must
      // never guess or default it (that was the bug: this used to write
      // membership: "basic", which made every new signup look like a
      // real gym member with a "basic" contract).
      //
      // `appMembership` is the app subscription tier (basic/silver/gold),
      // completely separate from the gym contract, and is fine to default
      // — it just controls app-only features like push notifications,
      // community chat, and AI credits.
      const newUser: MK2User = {
        uid,
        email: email.toLowerCase().trim(),
        name,
        goal,
        level,
        color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
        workouts: [],
        bookings: [],
        weights: [],
        checkIns: [],
        points: 0,
        appMembership: "basic",
        createdAt: Date.now(),
        classCredits: 0,
        aiCredits: {},
        termsAcceptedAt: Date.now(),
        termsVersion: "March 2026",
      };
      await saveUser(uid, newUser);

      // T&C acceptance audit record
      try {
        await set(ref(db, `terms_acceptance/${uid}`), {
          uid,
          name,
          email: email.toLowerCase().trim(),
          acceptedAt: Date.now(),
          termsVersion: "March 2026",
          platform: "web",
        });
      } catch {
        /* non-critical */
      }

      // ── Admin awareness — flag this signup as awaiting a gym contract ────
      // Lightweight breadcrumb so gym admins/reception have a running list
      // of "signed up on the app, still needs their contract tier set"
      // without having to eyeball the full member list. Purely additive —
      // safe to ignore if you don't wire up a UI for it yet, and it never
      // affects booking/pricing logic (that's driven by `membership` only).
      try {
        await push(ref(db, "membership_pending_review"), {
          uid,
          name,
          email: email.toLowerCase().trim(),
          signedUpAt: Date.now(),
          note: "New app signup — no gym contract tier assigned yet.",
        });
      } catch {
        /* non-critical */
      }

      // Verification email
      try {
        await sendEmailVerification(cred.user);
      } catch {
        /* non-blocking */
      }

      logEvent("sign_up", { method: "email" });
      setUser(newUser);
      toast(
        `Welcome to MK2, ${name}! Check your email to verify your account 🔥`,
        "success",
      );
    } catch (e: any) {
      toast(
        e.code === "auth/email-already-in-use"
          ? "Email already registered. Log in."
          : e.message,
        "error",
      );
    }
    setLoading(false);
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const forgotPassword = async () => {
    if (!email.trim()) return toast("Enter your email address first", "error");
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
      toast("✓ Reset email sent — check your inbox", "success");
    } catch {
      toast("Could not send reset email — check the address", "error");
    }
    setResetting(false);
  };

  const inp =
    "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none font-body placeholder:text-white/30 focus:border-[#00C4CC]/60 focus:bg-black/60 transition-all duration-200";
  const lbl =
    "text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 block mb-1.5";

  return (
    <>
      {/* ── Doc overlays — rendered outside the form so they're always on top */}
      <AnimatePresence>
        {docOpen && (
          <DocOverlay title={docOpen} onClose={() => setDocOpen(null)} />
        )}
      </AnimatePresence>

      <div
        className="dark min-h-screen relative overflow-hidden flex items-stretch"
        style={{ background: "#070707" }}
      >
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              radial-gradient(ellipse 80% 60% at 20% 50%, hsl(20 100% 50% / 0.12) 0%, transparent 60%),
              radial-gradient(ellipse 60% 80% at 80% 30%, hsl(187 100% 40% / 0.10) 0%, transparent 55%),
              radial-gradient(ellipse 40% 40% at 50% 90%, hsl(20 100% 50% / 0.06) 0%, transparent 50%)`,
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />
          <div
            className="absolute top-0 right-0 w-[55%] h-full opacity-[0.03]"
            style={{
              background:
                "linear-gradient(135deg, transparent 30%, hsl(187 100% 40%) 100%)",
            }}
          />
        </div>

        {/* Left hero panel — desktop only */}
        {!isMobile && (
          <div className="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-[55%]">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Logo size="md" />
            </motion.div>
            <div>
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <div
                  className="text-[11px] font-bold tracking-[0.3em] uppercase mb-4"
                  style={{ color: "hsl(20 100% 50%)" }}
                >
                  ★ ★ ★ &nbsp; RUIMSIG, JOHANNESBURG &nbsp; ★ ★ ★
                </div>
                <h1
                  className="font-display leading-[0.9] mb-6"
                  style={{ fontSize: "clamp(52px, 6vw, 88px)" }}
                >
                  <span className="text-white block">TRAIN</span>
                  <span
                    className="block"
                    style={{ color: "hsl(187 100% 40%)" }}
                  >
                    HARDER.
                  </span>
                  <span className="text-white block">LIVE</span>
                  <span className="block" style={{ color: "hsl(20 100% 50%)" }}>
                    STRONGER.
                  </span>
                </h1>
                <p className="text-white/40 text-sm leading-relaxed max-w-[380px] font-body">
                  Your transformation begins the moment you walk through our
                  doors. Elite coaching, smart tools, and a community that
                  pushes you further.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="flex gap-8 mt-10"
              >
                {[
                  ["100+", "Members"],
                  ["8", "Daily Classes"],
                  ["10+", "Expert Coaches"],
                ].map(([val, label]) => (
                  <div key={label}>
                    <div
                      className="font-display text-[28px] leading-none"
                      style={{ color: "hsl(20 100% 50%)" }}
                    >
                      {val}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-white/30 mt-1">
                      {label}
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-[10px] tracking-[0.2em] text-white/20 uppercase"
            >
              © 2026 MK2 Rivers Fitness · Ruimsig, Johannesburg
            </motion.div>
          </div>
        )}

        {/* Right form panel */}
        <div
          className={`relative z-10 flex items-center justify-center ${isMobile ? "w-full p-5" : "w-[45%] min-w-[420px] p-8"}`}
        >
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="w-full max-w-[420px]"
          >
            {isMobile && (
              <div className="flex justify-center mb-8">
                <Logo size="lg" />
              </div>
            )}

            <div
              className="rounded-2xl p-7 border"
              style={{
                background: "rgba(10,10,10,0.85)",
                borderColor: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(20px)",
                boxShadow:
                  "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
              }}
            >
              <div className="mb-6">
                <div className="font-display text-[22px] tracking-[0.1em] text-white mb-1">
                  {mode === "login" ? "WELCOME BACK" : "JOIN THE GYM"}
                </div>
                <div className="text-[11px] text-white/30 tracking-wide">
                  {mode === "login"
                    ? "Sign in to your member dashboard"
                    : "Create your MK2 Rivers account"}
                </div>
              </div>

              {/* Mode toggle */}
              <div
                className="flex rounded-lg p-[3px] gap-[3px] mb-5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setResetSent(false);
                      setAgreedToTerms(false);
                    }}
                    className="flex-1 py-2.5 rounded-md border-none cursor-pointer font-body font-bold text-[11px] uppercase tracking-[0.08em] transition-all duration-200"
                    style={{
                      background:
                        mode === m ? "hsl(20 100% 50%)" : "transparent",
                      color: mode === m ? "#000" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {m === "login" ? "Sign In" : "Register"}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {mode === "register" && (
                    <div className="mb-3">
                      <label className={lbl}>Full Name</label>
                      <input
                        className={inp}
                        placeholder="e.g. Mandisa Khumalo"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="mb-3">
                    <label className={lbl}>Email Address</label>
                    <input
                      className={inp}
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className={mode === "register" ? "mb-3" : "mb-1"}>
                    <label className={lbl}>Password</label>
                    <input
                      className={inp}
                      type="password"
                      placeholder={
                        mode === "register"
                          ? "Min. 6 characters"
                          : "Your password"
                      }
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && mode === "login" && login()
                      }
                    />
                  </div>

                  {/* Forgot password */}
                  {mode === "login" && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={forgotPassword}
                        disabled={resetting}
                        className="bg-transparent border-none cursor-pointer font-body text-[11px] font-bold transition-colors"
                        style={{
                          color: resetSent
                            ? "hsl(142 72% 37%)"
                            : "rgba(255,255,255,0.35)",
                        }}
                      >
                        {resetSent
                          ? "✓ Reset email sent"
                          : resetting
                            ? "Sending…"
                            : "Forgot password?"}
                      </button>
                    </div>
                  )}

                  {mode === "register" && (
                    <>
                      <div className="grid grid-cols-2 gap-2.5 mb-4">
                        <div>
                          <label className={lbl}>Your Goal</label>
                          <select
                            className={inp}
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                          >
                            {GOALS.map((g) => (
                              <option key={g} style={{ background: "#111" }}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={lbl}>Level</label>
                          <select
                            className={inp}
                            value={level}
                            onChange={(e) => setLevel(e.target.value)}
                          >
                            {LEVELS.map((l) => (
                              <option key={l} style={{ background: "#111" }}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className={lbl}>Gender</label>
                          <div className="flex gap-2">
                            {(
                              [
                                { val: "male", label: "♂ Male" },
                                { val: "female", label: "♀ Female" },
                              ] as const
                            ).map((g) => (
                              <button
                                key={g.val}
                                type="button"
                                onClick={() => setGender(g.val)}
                                className="flex-1 py-2 rounded-lg font-body font-bold text-[11px] border-none cursor-pointer transition-all"
                                style={{
                                  background:
                                    gender === g.val
                                      ? "hsl(20 100% 50%)"
                                      : "rgba(255,255,255,0.05)",
                                  color:
                                    gender === g.val
                                      ? "#000"
                                      : "rgba(255,255,255,0.4)",
                                  border: `1px solid ${gender === g.val ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.08)"}`,
                                }}
                              >
                                {g.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* ── Terms checkbox — links now open DocOverlay ── */}
                      <div
                        className="flex items-start gap-3 mb-5 rounded-xl px-4 py-3.5 cursor-pointer"
                        style={{
                          background: agreedToTerms
                            ? "hsl(20 100% 50% / 0.08)"
                            : "rgba(255,255,255,0.03)",
                          border: `1px solid ${agreedToTerms ? "hsl(20 100% 50% / 0.3)" : "rgba(255,255,255,0.08)"}`,
                          transition: "all 0.2s",
                        }}
                        onClick={() => setAgreedToTerms(!agreedToTerms)}
                      >
                        {/* Custom checkbox */}
                        <div
                          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-all duration-200"
                          style={{
                            background: agreedToTerms
                              ? "hsl(20 100% 50%)"
                              : "transparent",
                            border: `2px solid ${agreedToTerms ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.2)"}`,
                          }}
                        >
                          {agreedToTerms && (
                            <svg
                              width="10"
                              height="8"
                              viewBox="0 0 10 8"
                              fill="none"
                            >
                              <path
                                d="M1 4L3.5 6.5L9 1"
                                stroke="#000"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>

                        <div
                          className="text-[11px] leading-relaxed"
                          style={{ color: "rgba(255,255,255,0.5)" }}
                        >
                          I agree to the{" "}
                          {/* ── T&C link — opens overlay, stops checkbox toggle ── */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocOpen("Terms & Conditions");
                            }}
                            className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
                            style={{
                              color: "hsl(20 100% 50%)",
                              fontSize: "11px",
                            }}
                          >
                            Terms & Conditions
                          </button>{" "}
                          and {/* ── Privacy link ── */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocOpen("Privacy Policy");
                            }}
                            className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
                            style={{
                              color: "hsl(187 100% 40%)",
                              fontSize: "11px",
                            }}
                          >
                            Privacy Policy
                          </button>{" "}
                          of MK Two Rivers Fitness.
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    onClick={mode === "login" ? login : register}
                    disabled={
                      loading || (mode === "register" && !agreedToTerms)
                    }
                    className="w-full py-3.5 rounded-lg font-body font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 border-none cursor-pointer"
                    style={{
                      background:
                        mode === "register" && !agreedToTerms
                          ? "rgba(255,82,0,0.3)"
                          : loading
                            ? "rgba(255,82,0,0.5)"
                            : "hsl(20 100% 50%)",
                      color: "#000",
                      opacity: loading ? 0.7 : 1,
                      cursor:
                        mode === "register" && !agreedToTerms
                          ? "not-allowed"
                          : "pointer",
                      boxShadow:
                        loading || (mode === "register" && !agreedToTerms)
                          ? "none"
                          : "0 4px 24px hsl(20 100% 50% / 0.4)",
                    }}
                  >
                    {loading
                      ? "Please wait…"
                      : mode === "login"
                        ? "Sign In →"
                        : agreedToTerms
                          ? "Create Account →"
                          : "Accept Terms to Continue"}
                  </button>
                </motion.div>
              </AnimatePresence>

              <div
                className="mt-4 flex items-center gap-2 text-[10px]"
                style={{ color: "rgba(255,255,255,0.2)" }}
              >
                <div
                  className="flex-1 h-px"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
                <span>🔒 SECURED BY FIREBASE</span>
                <div
                  className="flex-1 h-px"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              </div>
            </div>

            <div
              className="mt-4 rounded-lg py-2.5 px-4 flex items-center gap-2.5 text-xs font-body"
              style={{
                background: "hsl(187 100% 40% / 0.08)",
                border: "1px solid hsl(187 100% 40% / 0.2)",
                color: "hsl(187 100% 40%)",
              }}
            >
              <span>★★★★★</span>
              <span className="font-bold">MK2 Rivers Fitness</span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>
                · Ruimsig, Johannesburg
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}

// import { useState } from "react";
// import { useAuth, type MK2User } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import {
//   auth,
//   db,
//   fetchUser,
//   logEvent,
//   createUserWithEmailAndPassword,
//   signInWithEmailAndPassword,
// } from "@/lib/firebase";
// import { saveUser } from "@/lib/firebase";
// import { GOALS, LEVELS, ACCENT_COLORS } from "@/lib/constants";
// import { motion, AnimatePresence } from "framer-motion";
// import { requestNotificationPermission } from "@/lib/firebase-messaging";
// import { listenForForegroundMessages } from "@/lib/firebase-messaging";
// import { sendPasswordResetEmail, sendEmailVerification } from "firebase/auth";
// import { ref, set } from "firebase/database";

// // ── Inline doc overlay — renders Terms or Privacy without needing router ──────
// function DocOverlay({
//   title,
//   onClose,
// }: {
//   title: "Terms & Conditions" | "Privacy Policy";
//   onClose: () => void;
// }) {
//   const isTerms = title === "Terms & Conditions";
//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       exit={{ opacity: 0 }}
//       className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4"
//       style={{ background: "rgba(0,0,0,0.85)" }}
//       onClick={onClose}
//     >
//       <motion.div
//         initial={{ y: "100%", opacity: 0 }}
//         animate={{ y: 0, opacity: 1 }}
//         exit={{ y: "100%", opacity: 0 }}
//         transition={{ type: "spring", damping: 28, stiffness: 300 }}
//         className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
//         style={{
//           background: "#0a0a0a",
//           border: "1px solid rgba(255,255,255,0.08)",
//           maxHeight: "88vh",
//           display: "flex",
//           flexDirection: "column",
//         }}
//         onClick={(e) => e.stopPropagation()}
//       >
//         {/* Header */}
//         <div
//           className="flex items-center justify-between px-5 py-4 shrink-0"
//           style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
//         >
//           <div
//             className="font-display text-base tracking-[0.1em] uppercase"
//             style={{ color: "hsl(20 100% 50%)" }}
//           >
//             {title}
//           </div>
//           <button
//             onClick={onClose}
//             className="border-none bg-transparent cursor-pointer text-sm font-bold"
//             style={{ color: "rgba(255,255,255,0.4)" }}
//           >
//             ✕ Close
//           </button>
//         </div>

//         {/* Scrollable content */}
//         <div
//           className="overflow-y-auto px-5 py-4 text-xs leading-relaxed flex-1"
//           style={{ color: "rgba(255,255,255,0.45)" }}
//         >
//           {isTerms ? (
//             <>
//               <p className="mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
//                 Last updated: March 2026
//               </p>
//               {[
//                 {
//                   heading: "1. Membership & Access",
//                   body: "Membership grants you access to MK2 Rivers Fitness facilities and digital services during operating hours. Membership is personal and non-transferable. MK2 Rivers reserves the right to refuse or revoke access at its discretion.",
//                 },
//                 {
//                   heading: "2. Health & Safety",
//                   body: "By registering, you confirm that you are in good health and aware of the risks associated with physical exercise. MK2 Rivers Fitness is not liable for any injury, illness, or loss sustained on the premises or as a result of using our digital training tools.",
//                 },
//                 {
//                   heading: "3. Code of Conduct",
//                   body: "Members must behave respectfully toward staff and fellow members at all times. Harassment, intimidation, theft, or damage to property will result in immediate termination of membership without refund.",
//                 },
//                 {
//                   heading: "4. Payments & Cancellations",
//                   body: "Membership fees are charged monthly in advance. Cancellations require 30 days' written notice. No refunds are issued for unused portions of any billing period. Class credits and loyalty rewards have no cash value.",
//                 },
//                 {
//                   heading: "5. Digital Services",
//                   body: "AI-powered tools (Workout Planner, Nutrition Coach, etc.) are provided for informational purposes only and do not constitute medical or professional advice. Always consult a qualified professional before making changes to your health routine.",
//                 },
//                 {
//                   heading: "6. Privacy",
//                   body: "Your personal data is processed in accordance with our Privacy Policy. By registering, you consent to the collection and use of your data as described therein.",
//                 },
//                 {
//                   heading: "7. Changes to Terms",
//                   body: "MK2 Rivers Fitness may update these Terms at any time. Continued use of the app or facilities after changes constitutes acceptance of the revised Terms.",
//                 },
//               ].map((s) => (
//                 <div key={s.heading} className="mb-4">
//                   <div
//                     className="font-bold mb-1 text-[11px] uppercase tracking-wider"
//                     style={{ color: "hsl(20 100% 50%)" }}
//                   >
//                     {s.heading}
//                   </div>
//                   <p>{s.body}</p>
//                 </div>
//               ))}
//             </>
//           ) : (
//             <>
//               <p className="mb-3" style={{ color: "rgba(255,255,255,0.25)" }}>
//                 Last updated: March 2026
//               </p>
//               {[
//                 {
//                   heading: "1. What We Collect",
//                   body: "We collect your name, email address, fitness goal, training level, check-in history, workout logs, and usage data within the app. We do not collect payment card details — payments are handled by secure third-party processors.",
//                 },
//                 {
//                   heading: "2. How We Use Your Data",
//                   body: "Your data is used to personalise your experience, power AI training tools, track loyalty rewards, send relevant notifications, and improve our services. We do not sell your data to third parties.",
//                 },
//                 {
//                   heading: "3. Data Storage",
//                   body: "Data is stored securely via Google Firebase, hosted in data centres that comply with international security standards. Data may be stored outside South Africa in accordance with POPIA cross-border transfer requirements.",
//                 },
//                 {
//                   heading: "4. Your Rights (POPIA)",
//                   body: "Under the Protection of Personal Information Act (POPIA), you have the right to access, correct, or request deletion of your personal information at any time. Contact us at mk2riversfitness@gmail.com to exercise these rights.",
//                 },
//                 {
//                   heading: "5. Notifications",
//                   body: "With your permission, we may send push notifications about class bookings, check-in reminders, rewards, and news. You can disable notifications at any time in your device or app settings.",
//                 },
//                 {
//                   heading: "6. Cookies & Analytics",
//                   body: "We use Firebase Analytics to understand how members use the app. No personally identifiable information is shared with analytics providers beyond anonymised usage data.",
//                 },
//                 {
//                   heading: "7. Contact",
//                   body: "For privacy-related queries, contact us at mk2riversfitness@gmail.com or visit us at MK2 Rivers Fitness, Ruimsig, Johannesburg.",
//                 },
//               ].map((s) => (
//                 <div key={s.heading} className="mb-4">
//                   <div
//                     className="font-bold mb-1 text-[11px] uppercase tracking-wider"
//                     style={{ color: "hsl(187 100% 40%)" }}
//                   >
//                     {s.heading}
//                   </div>
//                   <p>{s.body}</p>
//                 </div>
//               ))}
//             </>
//           )}
//         </div>

//         {/* Footer CTA */}
//         <div
//           className="px-5 py-4 shrink-0"
//           style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
//         >
//           <button
//             onClick={onClose}
//             className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer transition hover:brightness-105"
//             style={{ background: "hsl(20 100% 50%)", color: "#000" }}
//           >
//             Got it — close
//           </button>
//         </div>
//       </motion.div>
//     </motion.div>
//   );
// }

// // ── Logo ──────────────────────────────────────────────────────────────────────
// function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
//   const heights: Record<string, number> = { sm: 36, md: 52, lg: 72 };
//   const [imgError, setImgError] = useState(false);
//   if (!imgError) {
//     return (
//       <img
//         src="/mk2r-logo.jpg"
//         alt="MK2 Rivers Fitness"
//         height={heights[size]}
//         style={{ height: heights[size], width: "auto", objectFit: "contain" }}
//         onError={() => setImgError(true)}
//       />
//     );
//   }
//   return (
//     <div>
//       <div
//         className="font-display tracking-[0.2em] text-white leading-none"
//         style={{ fontSize: heights[size] * 0.45 }}
//       >
//         MK2 RIVERS
//       </div>
//       <div
//         className="text-[9px] tracking-[0.25em] uppercase"
//         style={{ color: "hsl(187 100% 40%)" }}
//       >
//         FITNESS HUB
//       </div>
//     </div>
//   );
// }

// // ── AuthScreen ────────────────────────────────────────────────────────────────
// interface AuthScreenProps {
//   setPage?: (page: string) => void;
// }

// export function AuthScreen({ setPage }: AuthScreenProps) {
//   const { isMobile } = useBreakpoint();
//   const { setUser, toast } = useAuth();

//   const [mode, setMode] = useState<"login" | "register">("login");
//   const [email, setEmail] = useState("");
//   const [pw, setPw] = useState("");
//   const [name, setName] = useState("");
//   const [goal, setGoal] = useState(GOALS[0]);
//   const [level, setLevel] = useState(LEVELS[1]);
//   const [gender, setGender] = useState<"male" | "female">("male");
//   const [loading, setLoading] = useState(false);
//   const [resetSent, setResetSent] = useState(false);
//   const [resetting, setResetting] = useState(false);
//   const [agreedToTerms, setAgreedToTerms] = useState(false);

//   // ── Doc overlay state — null = closed ────────────────────────────────────
//   const [docOpen, setDocOpen] = useState<
//     "Terms & Conditions" | "Privacy Policy" | null
//   >(null);

//   // ── Login ─────────────────────────────────────────────────────────────────
//   const login = async () => {
//     if (!email || !pw) return toast("Fill in all fields", "error");
//     setLoading(true);
//     try {
//       const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
//       const userData = await fetchUser(cred.user.uid);
//       logEvent("login", { method: "email" });
//       const normalized = {
//         ...userData,
//         workouts: Array.isArray((userData as any).workouts)
//           ? (userData as any).workouts
//           : [],
//         bookings: Array.isArray((userData as any).bookings)
//           ? (userData as any).bookings
//           : [],
//         weights: Array.isArray((userData as any).weights)
//           ? (userData as any).weights
//           : [],
//         checkIns: Array.isArray((userData as any).checkIns)
//           ? (userData as any).checkIns
//           : [],
//         points: (userData as any).points ?? 0,
//       };
//       setUser(normalized as MK2User);
//       toast(`Welcome back, ${(userData as any).name}! 💪`, "success");
//     } catch (e: any) {
//       toast(
//         e.code === "auth/invalid-credential"
//           ? "Wrong email or password."
//           : e.message,
//         "error",
//       );
//     }
//     setLoading(false);
//   };

//   // ── Register ──────────────────────────────────────────────────────────────
//   const register = async () => {
//     if (!email || !pw || !name) return toast("Fill in all fields", "error");
//     if (pw.length < 6) return toast("Password needs 6+ characters", "error");
//     if (!agreedToTerms)
//       return toast("Please accept the Terms & Conditions to continue", "error");
//     setLoading(true);
//     try {
//       const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
//       const uid = cred.user.uid;
//       const newUser: MK2User = {
//         uid,
//         email: email.toLowerCase().trim(),
//         name,
//         goal,
//         level,
//         color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
//         workouts: [],
//         bookings: [],
//         weights: [],
//         checkIns: [],
//         points: 0,
//         membership: "basic",
//         createdAt: Date.now(),
//         classCredits: 0,
//         aiCredits: {},
//         termsAcceptedAt: Date.now(),
//         termsVersion: "March 2026",
//       };
//       await saveUser(uid, newUser);

//       // T&C acceptance audit record
//       try {
//         await set(ref(db, `terms_acceptance/${uid}`), {
//           uid,
//           name,
//           email: email.toLowerCase().trim(),
//           acceptedAt: Date.now(),
//           termsVersion: "March 2026",
//           platform: "web",
//         });
//       } catch {
//         /* non-critical */
//       }

//       // Verification email
//       try {
//         await sendEmailVerification(cred.user);
//       } catch {
//         /* non-blocking */
//       }

//       logEvent("sign_up", { method: "email" });
//       setUser(newUser);
//       toast(
//         `Welcome to MK2, ${name}! Check your email to verify your account 🔥`,
//         "success",
//       );
//     } catch (e: any) {
//       toast(
//         e.code === "auth/email-already-in-use"
//           ? "Email already registered. Log in."
//           : e.message,
//         "error",
//       );
//     }
//     setLoading(false);
//   };

//   // ── Forgot password ───────────────────────────────────────────────────────
//   const forgotPassword = async () => {
//     if (!email.trim()) return toast("Enter your email address first", "error");
//     setResetting(true);
//     try {
//       await sendPasswordResetEmail(auth, email.trim());
//       setResetSent(true);
//       toast("✓ Reset email sent — check your inbox", "success");
//     } catch {
//       toast("Could not send reset email — check the address", "error");
//     }
//     setResetting(false);
//   };

//   const inp =
//     "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none font-body placeholder:text-white/30 focus:border-[#00C4CC]/60 focus:bg-black/60 transition-all duration-200";
//   const lbl =
//     "text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 block mb-1.5";

//   return (
//     <>
//       {/* ── Doc overlays — rendered outside the form so they're always on top */}
//       <AnimatePresence>
//         {docOpen && (
//           <DocOverlay title={docOpen} onClose={() => setDocOpen(null)} />
//         )}
//       </AnimatePresence>

//       <div
//         className="dark min-h-screen relative overflow-hidden flex items-stretch"
//         style={{ background: "#070707" }}
//       >
//         {/* Background */}
//         <div className="absolute inset-0 z-0">
//           <div
//             className="absolute inset-0"
//             style={{
//               backgroundImage: `
//               radial-gradient(ellipse 80% 60% at 20% 50%, hsl(20 100% 50% / 0.12) 0%, transparent 60%),
//               radial-gradient(ellipse 60% 80% at 80% 30%, hsl(187 100% 40% / 0.10) 0%, transparent 55%),
//               radial-gradient(ellipse 40% 40% at 50% 90%, hsl(20 100% 50% / 0.06) 0%, transparent 50%)`,
//             }}
//           />
//           <div
//             className="absolute inset-0 opacity-[0.04]"
//             style={{
//               backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
//               backgroundSize: "60px 60px",
//             }}
//           />
//           <div
//             className="absolute top-0 right-0 w-[55%] h-full opacity-[0.03]"
//             style={{
//               background:
//                 "linear-gradient(135deg, transparent 30%, hsl(187 100% 40%) 100%)",
//             }}
//           />
//         </div>

//         {/* Left hero panel — desktop only */}
//         {!isMobile && (
//           <div className="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-[55%]">
//             <motion.div
//               initial={{ opacity: 0, x: -20 }}
//               animate={{ opacity: 1, x: 0 }}
//               transition={{ duration: 0.6 }}
//             >
//               <Logo size="md" />
//             </motion.div>
//             <div>
//               <motion.div
//                 initial={{ opacity: 0, y: 40 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ duration: 0.8, delay: 0.2 }}
//               >
//                 <div
//                   className="text-[11px] font-bold tracking-[0.3em] uppercase mb-4"
//                   style={{ color: "hsl(20 100% 50%)" }}
//                 >
//                   ★ ★ ★ &nbsp; RUIMSIG, JOHANNESBURG &nbsp; ★ ★ ★
//                 </div>
//                 <h1
//                   className="font-display leading-[0.9] mb-6"
//                   style={{ fontSize: "clamp(52px, 6vw, 88px)" }}
//                 >
//                   <span className="text-white block">TRAIN</span>
//                   <span
//                     className="block"
//                     style={{ color: "hsl(187 100% 40%)" }}
//                   >
//                     HARDER.
//                   </span>
//                   <span className="text-white block">LIVE</span>
//                   <span className="block" style={{ color: "hsl(20 100% 50%)" }}>
//                     STRONGER.
//                   </span>
//                 </h1>
//                 <p className="text-white/40 text-sm leading-relaxed max-w-[380px] font-body">
//                   Your transformation begins the moment you walk through our
//                   doors. Elite coaching, smart tools, and a community that
//                   pushes you further.
//                 </p>
//               </motion.div>
//               <motion.div
//                 initial={{ opacity: 0, y: 20 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 transition={{ duration: 0.6, delay: 0.5 }}
//                 className="flex gap-8 mt-10"
//               >
//                 {[
//                   ["100+", "Members"],
//                   ["8", "Daily Classes"],
//                   ["10+", "Expert Coaches"],
//                 ].map(([val, label]) => (
//                   <div key={label}>
//                     <div
//                       className="font-display text-[28px] leading-none"
//                       style={{ color: "hsl(20 100% 50%)" }}
//                     >
//                       {val}
//                     </div>
//                     <div className="text-[10px] uppercase tracking-widest text-white/30 mt-1">
//                       {label}
//                     </div>
//                   </div>
//                 ))}
//               </motion.div>
//             </div>
//             <motion.div
//               initial={{ opacity: 0 }}
//               animate={{ opacity: 1 }}
//               transition={{ delay: 0.8 }}
//               className="text-[10px] tracking-[0.2em] text-white/20 uppercase"
//             >
//               © 2026 MK2 Rivers Fitness · Ruimsig, Johannesburg
//             </motion.div>
//           </div>
//         )}

//         {/* Right form panel */}
//         <div
//           className={`relative z-10 flex items-center justify-center ${isMobile ? "w-full p-5" : "w-[45%] min-w-[420px] p-8"}`}
//         >
//           <motion.div
//             initial={{ opacity: 0, x: 30 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.6, delay: 0.1 }}
//             className="w-full max-w-[420px]"
//           >
//             {isMobile && (
//               <div className="flex justify-center mb-8">
//                 <Logo size="lg" />
//               </div>
//             )}

//             <div
//               className="rounded-2xl p-7 border"
//               style={{
//                 background: "rgba(10,10,10,0.85)",
//                 borderColor: "rgba(255,255,255,0.08)",
//                 backdropFilter: "blur(20px)",
//                 boxShadow:
//                   "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
//               }}
//             >
//               <div className="mb-6">
//                 <div className="font-display text-[22px] tracking-[0.1em] text-white mb-1">
//                   {mode === "login" ? "WELCOME BACK" : "JOIN THE GYM"}
//                 </div>
//                 <div className="text-[11px] text-white/30 tracking-wide">
//                   {mode === "login"
//                     ? "Sign in to your member dashboard"
//                     : "Create your MK2 Rivers account"}
//                 </div>
//               </div>

//               {/* Mode toggle */}
//               <div
//                 className="flex rounded-lg p-[3px] gap-[3px] mb-5"
//                 style={{
//                   background: "rgba(255,255,255,0.05)",
//                   border: "1px solid rgba(255,255,255,0.08)",
//                 }}
//               >
//                 {(["login", "register"] as const).map((m) => (
//                   <button
//                     key={m}
//                     onClick={() => {
//                       setMode(m);
//                       setResetSent(false);
//                       setAgreedToTerms(false);
//                     }}
//                     className="flex-1 py-2.5 rounded-md border-none cursor-pointer font-body font-bold text-[11px] uppercase tracking-[0.08em] transition-all duration-200"
//                     style={{
//                       background:
//                         mode === m ? "hsl(20 100% 50%)" : "transparent",
//                       color: mode === m ? "#000" : "rgba(255,255,255,0.4)",
//                     }}
//                   >
//                     {m === "login" ? "Sign In" : "Register"}
//                   </button>
//                 ))}
//               </div>

//               <AnimatePresence mode="wait">
//                 <motion.div
//                   key={mode}
//                   initial={{ opacity: 0, y: 8 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   exit={{ opacity: 0, y: -8 }}
//                   transition={{ duration: 0.2 }}
//                 >
//                   {mode === "register" && (
//                     <div className="mb-3">
//                       <label className={lbl}>Full Name</label>
//                       <input
//                         className={inp}
//                         placeholder="e.g. Mandisa Khumalo"
//                         value={name}
//                         onChange={(e) => setName(e.target.value)}
//                       />
//                     </div>
//                   )}

//                   <div className="mb-3">
//                     <label className={lbl}>Email Address</label>
//                     <input
//                       className={inp}
//                       type="email"
//                       placeholder="you@example.com"
//                       value={email}
//                       onChange={(e) => setEmail(e.target.value)}
//                     />
//                   </div>

//                   <div className={mode === "register" ? "mb-3" : "mb-1"}>
//                     <label className={lbl}>Password</label>
//                     <input
//                       className={inp}
//                       type="password"
//                       placeholder={
//                         mode === "register"
//                           ? "Min. 6 characters"
//                           : "Your password"
//                       }
//                       value={pw}
//                       onChange={(e) => setPw(e.target.value)}
//                       onKeyDown={(e) =>
//                         e.key === "Enter" && mode === "login" && login()
//                       }
//                     />
//                   </div>

//                   {/* Forgot password */}
//                   {mode === "login" && (
//                     <div className="flex justify-end mb-4">
//                       <button
//                         onClick={forgotPassword}
//                         disabled={resetting}
//                         className="bg-transparent border-none cursor-pointer font-body text-[11px] font-bold transition-colors"
//                         style={{
//                           color: resetSent
//                             ? "hsl(142 72% 37%)"
//                             : "rgba(255,255,255,0.35)",
//                         }}
//                       >
//                         {resetSent
//                           ? "✓ Reset email sent"
//                           : resetting
//                             ? "Sending…"
//                             : "Forgot password?"}
//                       </button>
//                     </div>
//                   )}

//                   {mode === "register" && (
//                     <>
//                       <div className="grid grid-cols-2 gap-2.5 mb-4">
//                         <div>
//                           <label className={lbl}>Your Goal</label>
//                           <select
//                             className={inp}
//                             value={goal}
//                             onChange={(e) => setGoal(e.target.value)}
//                           >
//                             {GOALS.map((g) => (
//                               <option key={g} style={{ background: "#111" }}>
//                                 {g}
//                               </option>
//                             ))}
//                           </select>
//                         </div>
//                         <div>
//                           <label className={lbl}>Level</label>
//                           <select
//                             className={inp}
//                             value={level}
//                             onChange={(e) => setLevel(e.target.value)}
//                           >
//                             {LEVELS.map((l) => (
//                               <option key={l} style={{ background: "#111" }}>
//                                 {l}
//                               </option>
//                             ))}
//                           </select>
//                         </div>
//                         <div className="col-span-2">
//                           <label className={lbl}>Gender</label>
//                           <div className="flex gap-2">
//                             {(
//                               [
//                                 { val: "male", label: "♂ Male" },
//                                 { val: "female", label: "♀ Female" },
//                               ] as const
//                             ).map((g) => (
//                               <button
//                                 key={g.val}
//                                 type="button"
//                                 onClick={() => setGender(g.val)}
//                                 className="flex-1 py-2 rounded-lg font-body font-bold text-[11px] border-none cursor-pointer transition-all"
//                                 style={{
//                                   background:
//                                     gender === g.val
//                                       ? "hsl(20 100% 50%)"
//                                       : "rgba(255,255,255,0.05)",
//                                   color:
//                                     gender === g.val
//                                       ? "#000"
//                                       : "rgba(255,255,255,0.4)",
//                                   border: `1px solid ${gender === g.val ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.08)"}`,
//                                 }}
//                               >
//                                 {g.label}
//                               </button>
//                             ))}
//                           </div>
//                         </div>
//                       </div>

//                       {/* ── Terms checkbox — links now open DocOverlay ── */}
//                       <div
//                         className="flex items-start gap-3 mb-5 rounded-xl px-4 py-3.5 cursor-pointer"
//                         style={{
//                           background: agreedToTerms
//                             ? "hsl(20 100% 50% / 0.08)"
//                             : "rgba(255,255,255,0.03)",
//                           border: `1px solid ${agreedToTerms ? "hsl(20 100% 50% / 0.3)" : "rgba(255,255,255,0.08)"}`,
//                           transition: "all 0.2s",
//                         }}
//                         onClick={() => setAgreedToTerms(!agreedToTerms)}
//                       >
//                         {/* Custom checkbox */}
//                         <div
//                           className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-all duration-200"
//                           style={{
//                             background: agreedToTerms
//                               ? "hsl(20 100% 50%)"
//                               : "transparent",
//                             border: `2px solid ${agreedToTerms ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.2)"}`,
//                           }}
//                         >
//                           {agreedToTerms && (
//                             <svg
//                               width="10"
//                               height="8"
//                               viewBox="0 0 10 8"
//                               fill="none"
//                             >
//                               <path
//                                 d="M1 4L3.5 6.5L9 1"
//                                 stroke="#000"
//                                 strokeWidth="2"
//                                 strokeLinecap="round"
//                                 strokeLinejoin="round"
//                               />
//                             </svg>
//                           )}
//                         </div>

//                         <div
//                           className="text-[11px] leading-relaxed"
//                           style={{ color: "rgba(255,255,255,0.5)" }}
//                         >
//                           I agree to the{" "}
//                           {/* ── T&C link — opens overlay, stops checkbox toggle ── */}
//                           <button
//                             onClick={(e) => {
//                               e.stopPropagation();
//                               setDocOpen("Terms & Conditions");
//                             }}
//                             className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
//                             style={{
//                               color: "hsl(20 100% 50%)",
//                               fontSize: "11px",
//                             }}
//                           >
//                             Terms & Conditions
//                           </button>{" "}
//                           and {/* ── Privacy link ── */}
//                           <button
//                             onClick={(e) => {
//                               e.stopPropagation();
//                               setDocOpen("Privacy Policy");
//                             }}
//                             className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
//                             style={{
//                               color: "hsl(187 100% 40%)",
//                               fontSize: "11px",
//                             }}
//                           >
//                             Privacy Policy
//                           </button>{" "}
//                           of MK Two Rivers Fitness.
//                         </div>
//                       </div>
//                     </>
//                   )}

//                   <button
//                     onClick={mode === "login" ? login : register}
//                     disabled={
//                       loading || (mode === "register" && !agreedToTerms)
//                     }
//                     className="w-full py-3.5 rounded-lg font-body font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 border-none cursor-pointer"
//                     style={{
//                       background:
//                         mode === "register" && !agreedToTerms
//                           ? "rgba(255,82,0,0.3)"
//                           : loading
//                             ? "rgba(255,82,0,0.5)"
//                             : "hsl(20 100% 50%)",
//                       color: "#000",
//                       opacity: loading ? 0.7 : 1,
//                       cursor:
//                         mode === "register" && !agreedToTerms
//                           ? "not-allowed"
//                           : "pointer",
//                       boxShadow:
//                         loading || (mode === "register" && !agreedToTerms)
//                           ? "none"
//                           : "0 4px 24px hsl(20 100% 50% / 0.4)",
//                     }}
//                   >
//                     {loading
//                       ? "Please wait…"
//                       : mode === "login"
//                         ? "Sign In →"
//                         : agreedToTerms
//                           ? "Create Account →"
//                           : "Accept Terms to Continue"}
//                   </button>
//                 </motion.div>
//               </AnimatePresence>

//               <div
//                 className="mt-4 flex items-center gap-2 text-[10px]"
//                 style={{ color: "rgba(255,255,255,0.2)" }}
//               >
//                 <div
//                   className="flex-1 h-px"
//                   style={{ background: "rgba(255,255,255,0.06)" }}
//                 />
//                 <span>🔒 SECURED BY FIREBASE</span>
//                 <div
//                   className="flex-1 h-px"
//                   style={{ background: "rgba(255,255,255,0.06)" }}
//                 />
//               </div>
//             </div>

//             <div
//               className="mt-4 rounded-lg py-2.5 px-4 flex items-center gap-2.5 text-xs font-body"
//               style={{
//                 background: "hsl(187 100% 40% / 0.08)",
//                 border: "1px solid hsl(187 100% 40% / 0.2)",
//                 color: "hsl(187 100% 40%)",
//               }}
//             >
//               <span>★★★★★</span>
//               <span className="font-bold">MK2 Rivers Fitness</span>
//               <span style={{ color: "rgba(255,255,255,0.3)" }}>
//                 · Ruimsig, Johannesburg
//               </span>
//             </div>
//           </motion.div>
//         </div>
//       </div>
//     </>
//   );
// }

// import { useState } from "react";
// import { useAuth, type MK2User } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import {
//   auth,
//   db, // <-- added: Realtime Database instance
//   fetchUser,
//   logEvent,
//   createUserWithEmailAndPassword,
//   signInWithEmailAndPassword,
// } from "@/lib/firebase";
// import { saveUser } from "@/lib/firebase";
// import { GOALS, LEVELS, ACCENT_COLORS } from "@/lib/constants";
// import { motion, AnimatePresence } from "framer-motion";
// import { requestNotificationPermission } from "@/lib/firebase-messaging"; // <-- added
// import { listenForForegroundMessages } from "@/lib/firebase-messaging"; // <-- added
// import { sendPasswordResetEmail, sendEmailVerification } from "firebase/auth";
// import { ref, set } from "firebase/database"; // <-- added: database helpers

// function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
//   const heights: Record<string, number> = { sm: 36, md: 52, lg: 72 };
//   const [imgError, setImgError] = useState(false);
//   if (!imgError) {
//     return (
//       <img
//         src="/mk2r-logo.jpg"
//         alt="MK2 Rivers Fitness"
//         height={heights[size]}
//         style={{ height: heights[size], width: "auto", objectFit: "contain" }}
//         onError={() => setImgError(true)}
//       />
//     );
//   }
//   return (
//     <div>
//       <div
//         className="font-display tracking-[0.2em] text-white leading-none"
//         style={{ fontSize: heights[size] * 0.45 }}
//       >
//         MK2 RIVERS
//       </div>
//       <div
//         className="text-[9px] tracking-[0.25em] uppercase"
//         style={{ color: "hsl(187 100% 40%)" }}
//       >
//         FITNESS HUB
//       </div>
//     </div>
//   );
// }

// interface AuthScreenProps {
//   setPage?: (page: string) => void;
// }

// export function AuthScreen({ setPage }: AuthScreenProps) {
//   const { isMobile } = useBreakpoint();
//   const { setUser, toast } = useAuth();
//   const [mode, setMode] = useState<"login" | "register">("login");
//   const [email, setEmail] = useState("");
//   const [pw, setPw] = useState("");
//   const [name, setName] = useState("");
//   const [goal, setGoal] = useState(GOALS[0]);
//   const [level, setLevel] = useState(LEVELS[1]);
//   const [gender, setGender] = useState<"male" | "female">("male");
//   const [loading, setLoading] = useState(false);
//   const [resetSent, setResetSent] = useState(false);
//   const [resetting, setResetting] = useState(false);

//   // ── Terms checkbox state
//   const [agreedToTerms, setAgreedToTerms] = useState(false);

//   const login = async () => {
//     if (!email || !pw) return toast("Fill in all fields", "error");
//     setLoading(true);
//     try {
//       const cred = await signInWithEmailAndPassword(auth, email.trim(), pw);
//       const userData = await fetchUser(cred.user.uid);
//       logEvent("login", { method: "email" });
//       const normalized = {
//         ...userData,
//         workouts: Array.isArray((userData as any).workouts)
//           ? (userData as any).workouts
//           : [],
//         bookings: Array.isArray((userData as any).bookings)
//           ? (userData as any).bookings
//           : [],
//         weights: Array.isArray((userData as any).weights)
//           ? (userData as any).weights
//           : [],
//         checkIns: Array.isArray((userData as any).checkIns)
//           ? (userData as any).checkIns
//           : [],
//         points: (userData as any).points ?? 0,
//       };
//       setUser(normalized as MK2User);
//       toast(`Welcome back, ${(userData as any).name}! 💪`, "success");
//     } catch (e: any) {
//       toast(
//         e.code === "auth/invalid-credential"
//           ? "Wrong email or password."
//           : e.message,
//         "error",
//       );
//     }
//     setLoading(false);
//   };

//   const register = async () => {
//     if (!email || !pw || !name) return toast("Fill in all fields", "error");
//     if (pw.length < 6) return toast("Password needs 6+ characters", "error");
//     if (!agreedToTerms)
//       return toast("Please accept the Terms & Conditions to continue", "error");
//     setLoading(true);
//     try {
//       const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
//       const uid = cred.user.uid;
//       const newUser: MK2User = {
//         uid,
//         email: email.toLowerCase().trim(),
//         name,
//         goal,
//         level,
//         color: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
//         workouts: [],
//         bookings: [],
//         weights: [],
//         checkIns: [],
//         points: 0,
//         membership: "basic",
//         createdAt: Date.now(),
//         classCredits: 0,
//         aiCredits: {},
//         termsAcceptedAt: Date.now(),
//         termsVersion: "March 2026",
//       };
//       await saveUser(uid, newUser);

//       // Save T&C acceptance record separately for admin audit
//       try {
//         await set(ref(db, `terms_acceptance/${uid}`), {
//           uid,
//           name,
//           email: email.toLowerCase().trim(),
//           acceptedAt: Date.now(),
//           termsVersion: "March 2026",
//           platform: "web",
//         });
//       } catch {
//         // Non-critical — don't block registration
//       }

//       // Send verification email silently
//       try {
//         await sendEmailVerification(cred.user);
//       } catch {
//         // Non-blocking — don't fail registration if verification email fails
//       }

//       logEvent("sign_up", { method: "email" });
//       setUser(newUser);
//       toast(
//         `Welcome to MK2, ${name}! Check your email to verify your account 🔥`,
//         "success",
//       );
//     } catch (e: any) {
//       toast(
//         e.code === "auth/email-already-in-use"
//           ? "Email already registered. Log in."
//           : e.message,
//         "error",
//       );
//     }
//     setLoading(false);
//   };

//   const forgotPassword = async () => {
//     if (!email.trim()) return toast("Enter your email address first", "error");
//     setResetting(true);
//     try {
//       await sendPasswordResetEmail(auth, email.trim());
//       setResetSent(true);
//       toast("✓ Reset email sent — check your inbox", "success");
//     } catch {
//       toast("Could not send reset email — check the address", "error");
//     }
//     setResetting(false);
//   };

//   const inp =
//     "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm outline-none font-body placeholder:text-white/30 focus:border-[#00C4CC]/60 focus:bg-black/60 transition-all duration-200";
//   const lbl =
//     "text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 block mb-1.5";

//   return (
//     <div
//       className="dark min-h-screen relative overflow-hidden flex items-stretch"
//       style={{ background: "#070707" }}
//     >
//       {/* Background */}
//       <div className="absolute inset-0 z-0">
//         <div
//           className="absolute inset-0"
//           style={{
//             backgroundImage: `
//             radial-gradient(ellipse 80% 60% at 20% 50%, hsl(20 100% 50% / 0.12) 0%, transparent 60%),
//             radial-gradient(ellipse 60% 80% at 80% 30%, hsl(187 100% 40% / 0.10) 0%, transparent 55%),
//             radial-gradient(ellipse 40% 40% at 50% 90%, hsl(20 100% 50% / 0.06) 0%, transparent 50%)`,
//           }}
//         />
//         <div
//           className="absolute inset-0 opacity-[0.04]"
//           style={{
//             backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
//             backgroundSize: "60px 60px",
//           }}
//         />
//         <div
//           className="absolute top-0 right-0 w-[55%] h-full opacity-[0.03]"
//           style={{
//             background:
//               "linear-gradient(135deg, transparent 30%, hsl(187 100% 40%) 100%)",
//           }}
//         />
//       </div>

//       {/* Left hero panel — desktop only */}
//       {!isMobile && (
//         <div className="relative z-10 flex-1 flex flex-col justify-between p-12 max-w-[55%]">
//           <motion.div
//             initial={{ opacity: 0, x: -20 }}
//             animate={{ opacity: 1, x: 0 }}
//             transition={{ duration: 0.6 }}
//           >
//             <Logo size="md" />
//           </motion.div>
//           <div>
//             <motion.div
//               initial={{ opacity: 0, y: 40 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.8, delay: 0.2 }}
//             >
//               <div
//                 className="text-[11px] font-bold tracking-[0.3em] uppercase mb-4"
//                 style={{ color: "hsl(20 100% 50%)" }}
//               >
//                 ★ ★ ★ &nbsp; RUIMSIG, JOHANNESBURG &nbsp; ★ ★ ★
//               </div>
//               <h1
//                 className="font-display leading-[0.9] mb-6"
//                 style={{ fontSize: "clamp(52px, 6vw, 88px)" }}
//               >
//                 <span className="text-white block">TRAIN</span>
//                 <span className="block" style={{ color: "hsl(187 100% 40%)" }}>
//                   HARDER.
//                 </span>
//                 <span className="text-white block">LIVE</span>
//                 <span className="block" style={{ color: "hsl(20 100% 50%)" }}>
//                   STRONGER.
//                 </span>
//               </h1>
//               <p className="text-white/40 text-sm leading-relaxed max-w-[380px] font-body">
//                 Your transformation begins the moment you walk through our
//                 doors. Elite coaching, smart tools, and a community that pushes
//                 you further.
//               </p>
//             </motion.div>
//             <motion.div
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.6, delay: 0.5 }}
//               className="flex gap-8 mt-10"
//             >
//               {[
//                 ["100+", "Members"],
//                 ["8", "Daily Classes"],
//                 ["10+", "Expert Coaches"],
//               ].map(([val, label]) => (
//                 <div key={label}>
//                   <div
//                     className="font-display text-[28px] leading-none"
//                     style={{ color: "hsl(20 100% 50%)" }}
//                   >
//                     {val}
//                   </div>
//                   <div className="text-[10px] uppercase tracking-widest text-white/30 mt-1">
//                     {label}
//                   </div>
//                 </div>
//               ))}
//             </motion.div>
//           </div>
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             transition={{ delay: 0.8 }}
//             className="text-[10px] tracking-[0.2em] text-white/20 uppercase"
//           >
//             © 2026 MK2 Rivers Fitness · Ruimsig, Johannesburg
//           </motion.div>
//         </div>
//       )}

//       {/* Right form panel */}
//       <div
//         className={`relative z-10 flex items-center justify-center ${isMobile ? "w-full p-5" : "w-[45%] min-w-[420px] p-8"}`}
//       >
//         <motion.div
//           initial={{ opacity: 0, x: 30 }}
//           animate={{ opacity: 1, x: 0 }}
//           transition={{ duration: 0.6, delay: 0.1 }}
//           className="w-full max-w-[420px]"
//         >
//           {isMobile && (
//             <div className="flex justify-center mb-8">
//               <Logo size="lg" />
//             </div>
//           )}

//           <div
//             className="rounded-2xl p-7 border"
//             style={{
//               background: "rgba(10,10,10,0.85)",
//               borderColor: "rgba(255,255,255,0.08)",
//               backdropFilter: "blur(20px)",
//               boxShadow:
//                 "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
//             }}
//           >
//             <div className="mb-6">
//               <div className="font-display text-[22px] tracking-[0.1em] text-white mb-1">
//                 {mode === "login" ? "WELCOME BACK" : "JOIN THE GYM"}
//               </div>
//               <div className="text-[11px] text-white/30 tracking-wide">
//                 {mode === "login"
//                   ? "Sign in to your member dashboard"
//                   : "Create your MK2 Rivers account"}
//               </div>
//             </div>

//             <div
//               className="flex rounded-lg p-[3px] gap-[3px] mb-5"
//               style={{
//                 background: "rgba(255,255,255,0.05)",
//                 border: "1px solid rgba(255,255,255,0.08)",
//               }}
//             >
//               {(["login", "register"] as const).map((m) => (
//                 <button
//                   key={m}
//                   onClick={() => {
//                     setMode(m);
//                     setResetSent(false);
//                     setAgreedToTerms(false);
//                   }}
//                   className="flex-1 py-2.5 rounded-md border-none cursor-pointer font-body font-bold text-[11px] uppercase tracking-[0.08em] transition-all duration-200"
//                   style={{
//                     background: mode === m ? "hsl(20 100% 50%)" : "transparent",
//                     color: mode === m ? "#000" : "rgba(255,255,255,0.4)",
//                   }}
//                 >
//                   {m === "login" ? "Sign In" : "Register"}
//                 </button>
//               ))}
//             </div>

//             <AnimatePresence mode="wait">
//               <motion.div
//                 key={mode}
//                 initial={{ opacity: 0, y: 8 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 exit={{ opacity: 0, y: -8 }}
//                 transition={{ duration: 0.2 }}
//               >
//                 {mode === "register" && (
//                   <div className="mb-3">
//                     <label className={lbl}>Full Name</label>
//                     <input
//                       className={inp}
//                       placeholder="e.g. Mandisa Khumalo"
//                       value={name}
//                       onChange={(e) => setName(e.target.value)}
//                     />
//                   </div>
//                 )}

//                 <div className="mb-3">
//                   <label className={lbl}>Email Address</label>
//                   <input
//                     className={inp}
//                     type="email"
//                     placeholder="you@example.com"
//                     value={email}
//                     onChange={(e) => setEmail(e.target.value)}
//                   />
//                 </div>

//                 <div className={mode === "register" ? "mb-3" : "mb-1"}>
//                   <label className={lbl}>Password</label>
//                   <input
//                     className={inp}
//                     type="password"
//                     placeholder={
//                       mode === "register"
//                         ? "Min. 6 characters"
//                         : "Your password"
//                     }
//                     value={pw}
//                     onChange={(e) => setPw(e.target.value)}
//                     onKeyDown={(e) =>
//                       e.key === "Enter" && mode === "login" && login()
//                     }
//                   />
//                 </div>

//                 {/* Forgot password — login only */}
//                 {mode === "login" && (
//                   <div className="flex justify-end mb-4">
//                     <button
//                       onClick={forgotPassword}
//                       disabled={resetting}
//                       className="bg-transparent border-none cursor-pointer font-body text-[11px] font-bold transition-colors"
//                       style={{
//                         color: resetSent
//                           ? "hsl(142 72% 37%)"
//                           : "rgba(255,255,255,0.35)",
//                       }}
//                     >
//                       {resetSent
//                         ? "✓ Reset email sent"
//                         : resetting
//                           ? "Sending…"
//                           : "Forgot password?"}
//                     </button>
//                   </div>
//                 )}

//                 {mode === "register" && (
//                   <>
//                     <div className="grid grid-cols-2 gap-2.5 mb-4">
//                       <div>
//                         <label className={lbl}>Your Goal</label>
//                         <select
//                           className={inp}
//                           value={goal}
//                           onChange={(e) => setGoal(e.target.value)}
//                         >
//                           {GOALS.map((g) => (
//                             <option key={g} style={{ background: "#111" }}>
//                               {g}
//                             </option>
//                           ))}
//                         </select>
//                       </div>
//                       <div>
//                         <label className={lbl}>Level</label>
//                         <select
//                           className={inp}
//                           value={level}
//                           onChange={(e) => setLevel(e.target.value)}
//                         >
//                           {LEVELS.map((l) => (
//                             <option key={l} style={{ background: "#111" }}>
//                               {l}
//                             </option>
//                           ))}
//                         </select>
//                       </div>
//                       <div className="col-span-2">
//                         <label className={lbl}>Gender</label>
//                         <div className="flex gap-2">
//                           {(
//                             [
//                               { val: "male", label: "♂ Male" },
//                               { val: "female", label: "♀ Female" },
//                             ] as const
//                           ).map((g) => (
//                             <button
//                               key={g.val}
//                               type="button"
//                               onClick={() => setGender(g.val)}
//                               className="flex-1 py-2 rounded-lg font-body font-bold text-[11px] border-none cursor-pointer transition-all"
//                               style={{
//                                 background:
//                                   gender === g.val
//                                     ? "hsl(20 100% 50%)"
//                                     : "rgba(255,255,255,0.05)",
//                                 color:
//                                   gender === g.val
//                                     ? "#000"
//                                     : "rgba(255,255,255,0.4)",
//                                 border: `1px solid ${gender === g.val ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.08)"}`,
//                               }}
//                             >
//                               {g.label}
//                             </button>
//                           ))}
//                         </div>
//                       </div>
//                     </div>

//                     {/* Terms & Conditions checkbox */}
//                     <div
//                       className="flex items-start gap-3 mb-5 rounded-xl px-4 py-3.5 cursor-pointer"
//                       style={{
//                         background: agreedToTerms
//                           ? "hsl(20 100% 50% / 0.08)"
//                           : "rgba(255,255,255,0.03)",
//                         border: `1px solid ${agreedToTerms ? "hsl(20 100% 50% / 0.3)" : "rgba(255,255,255,0.08)"}`,
//                         transition: "all 0.2s",
//                       }}
//                       onClick={() => setAgreedToTerms(!agreedToTerms)}
//                     >
//                       {/* Custom checkbox */}
//                       <div
//                         className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5 transition-all duration-200"
//                         style={{
//                           background: agreedToTerms
//                             ? "hsl(20 100% 50%)"
//                             : "transparent",
//                           border: `2px solid ${agreedToTerms ? "hsl(20 100% 50%)" : "rgba(255,255,255,0.2)"}`,
//                         }}
//                       >
//                         {agreedToTerms && (
//                           <svg
//                             width="10"
//                             height="8"
//                             viewBox="0 0 10 8"
//                             fill="none"
//                           >
//                             <path
//                               d="M1 4L3.5 6.5L9 1"
//                               stroke="#000"
//                               strokeWidth="2"
//                               strokeLinecap="round"
//                               strokeLinejoin="round"
//                             />
//                           </svg>
//                         )}
//                       </div>
//                       <div
//                         className="text-[11px] leading-relaxed"
//                         style={{ color: "rgba(255,255,255,0.5)" }}
//                       >
//                         I agree to the{" "}
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             setPage?.("Terms");
//                           }}
//                           className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
//                           style={{
//                             color: "hsl(20 100% 50%)",
//                             fontSize: "11px",
//                           }}
//                         >
//                           Terms & Conditions
//                         </button>{" "}
//                         and{" "}
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             setPage?.("Privacy");
//                           }}
//                           className="bg-transparent border-none cursor-pointer font-bold p-0 underline"
//                           style={{
//                             color: "hsl(187 100% 40%)",
//                             fontSize: "11px",
//                           }}
//                         >
//                           Privacy Policy
//                         </button>{" "}
//                         of MK Two Rivers Fitness.
//                       </div>
//                     </div>
//                   </>
//                 )}

//                 <button
//                   onClick={mode === "login" ? login : register}
//                   disabled={loading || (mode === "register" && !agreedToTerms)}
//                   className="w-full py-3.5 rounded-lg font-body font-bold text-sm uppercase tracking-[0.1em] transition-all duration-200 border-none cursor-pointer"
//                   style={{
//                     background:
//                       mode === "register" && !agreedToTerms
//                         ? "rgba(255,82,0,0.3)"
//                         : loading
//                           ? "rgba(255,82,0,0.5)"
//                           : "hsl(20 100% 50%)",
//                     color: "#000",
//                     opacity: loading ? 0.7 : 1,
//                     cursor:
//                       mode === "register" && !agreedToTerms
//                         ? "not-allowed"
//                         : "pointer",
//                     boxShadow:
//                       loading || (mode === "register" && !agreedToTerms)
//                         ? "none"
//                         : "0 4px 24px hsl(20 100% 50% / 0.4)",
//                   }}
//                 >
//                   {loading
//                     ? "Please wait…"
//                     : mode === "login"
//                       ? "Sign In →"
//                       : agreedToTerms
//                         ? "Create Account →"
//                         : "Accept Terms to Continue"}
//                 </button>
//               </motion.div>
//             </AnimatePresence>

//             <div
//               className="mt-4 flex items-center gap-2 text-[10px]"
//               style={{ color: "rgba(255,255,255,0.2)" }}
//             >
//               <div
//                 className="flex-1 h-px"
//                 style={{ background: "rgba(255,255,255,0.06)" }}
//               />
//               <span>🔒 SECURED BY FIREBASE</span>
//               <div
//                 className="flex-1 h-px"
//                 style={{ background: "rgba(255,255,255,0.06)" }}
//               />
//             </div>
//           </div>

//           <div
//             className="mt-4 rounded-lg py-2.5 px-4 flex items-center gap-2.5 text-xs font-body"
//             style={{
//               background: "hsl(187 100% 40% / 0.08)",
//               border: "1px solid hsl(187 100% 40% / 0.2)",
//               color: "hsl(187 100% 40%)",
//             }}
//           >
//             <span>★★★★★</span>
//             <span className="font-bold">MK2 Rivers Fitness</span>
//             <span style={{ color: "rgba(255,255,255,0.3)" }}>
//               · Ruimsig, Johannesburg
//             </span>
//           </div>
//         </motion.div>
//       </div>
//     </div>
//   );
// }
