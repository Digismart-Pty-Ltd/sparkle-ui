import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { PageTitle } from "@/components/shared/PageTitle";
import { motion } from "framer-motion";
import { getFunctions, httpsCallable } from "firebase/functions";

// ── PayFast sign endpoint — deployed Firebase Cloud Function (europe-west1) ──
const BACKEND_URL =
  "https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastSign";

// ── Environment flag ──────────────────────────────────────────────────────────
const IS_SANDBOX = import.meta.env.VITE_PAYFAST_SANDBOX !== "false";

const functions = getFunctions(undefined, "europe-west1");

// ── Plans ─────────────────────────────────────────────────────────────────────
const TIERS = [
  {
    id: "basic",
    name: "Basic",
    priceMonthly: 0,
    priceAnnual: 0,
    priceLabel: "Free",
    annualLabel: null,
    color: "#9ca3af",
    aiCredits: 0,
    features: [
      "Stay updated on MK2R events",
      "Book a class (Octiv link)",
      "News & info",
      "Events",
      "Internal advertisements",
      "Google Ads",
      "Links to socials",
      "Help articles",
    ],
    locked: [
      "Push notifications",
      "Community chat",
      "Leaderboard",
      "Loyalty card",
      "Discount coupons",
      "Body Tracker",
      "AI Meal Plans",
      "AI Workout Planner",
    ],
    payfastItemName: null,
  },
  {
    id: "silver",
    name: "Silver",
    priceMonthly: 24,
    priceAnnual: 228,
    priceLabel: "R24/mo",
    annualLabel: "R228/yr",
    color: "#cbd5e1",
    aiCredits: 20,
    features: [
      "Book a class (Octiv link)",
      "News & info",
      "Events",
      "Internal advertisements / banners",
      "Google Ads",
      "Links to socials",
      "Help articles",
      "Push notifications",
      "Community chat",
      "Leaderboard",
      "20 AI credits / month",
    ],
    locked: [
      "Gym Loyalty card",
      "Discount coupons",
      "Body Tracker",
      "AI Meal Plans",
      "No Google Ads",
    ],
    payfastItemName: "MK2R Silver Membership - Monthly",
    payfastItemNameAnnual: "MK2R Silver Membership - Annual",
  },
  {
    id: "gold",
    name: "Gold",
    priceMonthly: 54,
    priceAnnual: 588,
    priceLabel: "R54/mo",
    annualLabel: "R588/yr",
    color: "hsl(38 92% 50%)",
    aiCredits: 100,
    features: [
      "Book a class (Octiv link)",
      "News & info",
      "Events",
      "Internal advertisements / banners",
      "No Google Ads",
      "Quick links to socials",
      "Help articles",
      "Push notifications",
      "Community chat",
      "Gym Loyalty card",
      "Discount coupons",
      "Body Tracker",
      "AI Meal Plans",
      "AI Workout Planner",
      "100 AI credits / month",
    ],
    locked: [],
    payfastItemName: "MK2R Gold Membership - Monthly",
    payfastItemNameAnnual: "MK2R Gold Membership - Annual",
  },
] as const;

type Tier = (typeof TIERS)[number];

async function getSubscriptionUrl(
  tier: Tier,
  annual: boolean,
  userEmail: string,
  userName: string,
  uid: string,
): Promise<string> {
  const amount = annual ? tier.priceAnnual : tier.priceMonthly;
  const itemName = annual
    ? (tier as any).payfastItemNameAnnual
    : tier.payfastItemName;

  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: userEmail,
      name_first: userName.split(" ")[0],
      name_last: userName.split(" ").slice(1).join(" ") || "-",
      item_name: itemName,
      amount: amount.toFixed(2),
      recurring_amount: amount.toFixed(2),
      frequency: annual ? "6" : "3",
      custom_str1: uid,
      custom_str2: tier.id,
      custom_str3: annual ? "yearly" : "monthly",
    }),
  });

  const data = await res.json();
  if (!data.url) throw new Error("Failed to get payment URL");
  return data.url;
}

export function Membership({ setPage }: { setPage: (p: string) => void }) {
  const { user } = useAuth();
  const { isMobile } = useBreakpoint();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [busyTierId, setBusyTierId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  if (!user) return null;

  const aiCredits = (user as any).aiQuota?.remaining ?? 0;
  const aiTotal = (user as any).aiQuota?.total ?? 0;
  const currentTierId = (user as any).membership ?? "basic";
  const currentTier = TIERS.find((t) => t.id === currentTierId) ?? TIERS[0];

  const cancellationPending: boolean = !!(user as any).cancellationPending;
  const pendingDowngradeTierId: string | null =
    (user as any).pendingDowngrade?.tier ?? null;
  const pendingDowngradeTierName = pendingDowngradeTierId
    ? (TIERS.find((t) => t.id === pendingDowngradeTierId)?.name ??
      pendingDowngradeTierId)
    : null;

  async function handleDowngrade(t: Tier) {
    if (cancellationPending) {
      alert(
        "You already have a pending plan change. Resolve it below before scheduling another.",
      );
      return;
    }
    const confirmed = window.confirm(
      `Your plan will switch to ${t.name} at the end of your current billing period. You'll keep ${currentTier.name} access until then. Continue?`,
    );
    if (!confirmed) return;

    setBusyTierId(t.id);
    try {
      const scheduleDowngrade = httpsCallable(functions, "scheduleDowngrade");
      await scheduleDowngrade({ targetTier: t.id });
    } catch (err: any) {
      alert(err?.message || "Failed to schedule downgrade. Please try again.");
    } finally {
      setBusyTierId(null);
    }
  }

  async function handleUpgrade(t: Tier) {
    setBusyTierId(t.id);
    try {
      const url = await getSubscriptionUrl(
        t,
        billing === "annual",
        user.email,
        user.name,
        user.uid,
      );
      window.open(url, "_blank");
    } catch (err) {
      alert("Failed to load payment page. Please try again.");
    } finally {
      setBusyTierId(null);
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      "Cancel your subscription? You'll keep access until the end of your current billing period, then move to the Basic plan.",
    );
    if (!confirmed) return;

    setCancelling(true);
    try {
      const cancelSubscription = httpsCallable(functions, "cancelSubscription");
      await cancelSubscription();
    } catch (err: any) {
      alert(err?.message || "Failed to cancel. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
    >
      <PageTitle sub="Choose the plan that works for you">
        Gym <span className="text-primary">Membership</span>
      </PageTitle>

      {currentTierId !== "basic" && (
        <div
          className="mk2-card mb-5 flex items-center justify-between gap-4"
          style={{ borderLeft: "3px solid hsl(20 100% 50%)" }}
        >
          <div>
            <div className="font-bold text-sm mb-0.5">AI Credits</div>
            <div className="text-xs text-muted-foreground">
              Used for AI Workout Planner &amp; Nutrition Coach · resets on the
              1st
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-display text-4xl text-primary">
              {aiCredits}
            </div>
            <div className="text-[11px] text-muted-foreground">
              / {aiTotal} remaining
            </div>
          </div>
        </div>
      )}

      {cancellationPending && (
        <div
          className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-xs"
          style={{
            background: "hsl(38 92% 50% / 0.08)",
            border: "1px solid hsl(38 92% 50% / 0.3)",
            color: "hsl(38 92% 50%)",
          }}
        >
          <span className="text-base shrink-0">⏳</span>
          <span>
            {pendingDowngradeTierName ? (
              <>
                <strong>Plan change scheduled</strong> — you'll move to{" "}
                <strong>{pendingDowngradeTierName}</strong> at the end of your
                current billing period. You keep {currentTier.name} access until
                then.
              </>
            ) : (
              <>
                <strong>Cancellation scheduled</strong> — you'll move to the
                Basic plan at the end of your current billing period.
              </>
            )}
          </span>
        </div>
      )}

      {IS_SANDBOX && (
        <div
          className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-xs"
          style={{
            background: "hsl(217 91% 53% / 0.08)",
            border: "1px solid hsl(217 91% 53% / 0.25)",
            color: "hsl(217 91% 53%)",
          }}
        >
          <span className="text-base shrink-0">🔬</span>
          <span>
            <strong>Test mode active</strong> — payments go to PayFast Sandbox.
            Use test card: <strong>4000000000000002</strong> · No real charges.
          </span>
        </div>
      )}

      <div className="flex items-center justify-center mb-8 gap-3">
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: "hsl(var(--secondary))" }}
        >
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBilling(b)}
              className="px-5 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer font-body flex items-center gap-2"
              style={{
                background: billing === b ? "hsl(20 100% 50%)" : "transparent",
                color: billing === b ? "#000" : "hsl(var(--muted-foreground))",
              }}
            >
              {b === "monthly" ? "Monthly" : "Annual"}
              {b === "annual" && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background:
                      billing === "annual"
                        ? "rgba(0,0,0,0.2)"
                        : "hsl(142 72% 37% / 0.2)",
                    color: billing === "annual" ? "#000" : "hsl(142 72% 37%)",
                  }}
                >
                  Save ~15%
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mb-8">
        {TIERS.map((t, i) => {
          const isCurrent = t.id === currentTierId;
          const isDowngrade =
            currentTierId !== "basic" &&
            t.priceMonthly < currentTier.priceMonthly;
          const displayPrice =
            t.priceMonthly === 0
              ? "Free"
              : billing === "annual"
                ? `R${t.priceAnnual}/yr`
                : `R${t.priceMonthly}/mo`;

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="bg-card rounded-2xl p-5 flex flex-col relative overflow-hidden"
              style={{
                border: isCurrent
                  ? `2px solid ${t.color}`
                  : t.id === "gold"
                    ? `1px solid ${t.color}50`
                    : "1px solid hsl(var(--border))",
                boxShadow:
                  t.id === "gold" ? `0 0 24px ${t.color}18` : undefined,
              }}
            >
              {t.id === "gold" && (
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: t.color }}
                />
              )}

              {isCurrent && (
                <div
                  className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: `${t.color}20`,
                    color: t.color,
                    border: `1px solid ${t.color}40`,
                  }}
                >
                  ✓ Current
                </div>
              )}

              <div
                className="font-display text-2xl mb-1"
                style={{ color: t.color }}
              >
                {t.name}
              </div>
              <div className="font-bold text-2xl mb-0.5">{displayPrice}</div>
              {billing === "annual" && t.annualLabel && (
                <div className="text-[11px] text-muted-foreground mb-4">
                  billed annually · equiv. R{Math.round(t.priceAnnual / 12)}/mo
                </div>
              )}
              {billing === "monthly" && (
                <div className="text-[11px] text-muted-foreground mb-4">
                  {t.priceMonthly === 0
                    ? "No payment needed"
                    : "billed monthly"}
                </div>
              )}

              {t.aiCredits > 0 && (
                <div
                  className="self-start text-[11px] font-bold px-3 py-1 rounded-full mb-4 flex items-center gap-1.5"
                  style={{
                    background: "hsl(20 100% 50% / 0.1)",
                    color: "hsl(20 100% 50%)",
                    border: "1px solid hsl(20 100% 50% / 0.25)",
                  }}
                >
                  🤖 {t.aiCredits} AI credits/month
                </div>
              )}

              <div className="flex flex-col gap-1.5 mb-5 flex-1">
                {t.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs">
                    <span className="text-green-400 mt-px shrink-0">✓</span>
                    <span>{f}</span>
                  </div>
                ))}
                {t.locked.map((f) => (
                  <div
                    key={f}
                    className="flex items-start gap-2 text-xs text-muted-foreground line-through"
                  >
                    <span className="mt-px shrink-0">✕</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              {isCurrent ? (
                <div
                  className="text-center text-[12px] font-bold py-3 rounded-xl"
                  style={{ background: `${t.color}15`, color: t.color }}
                >
                  ✓ Your Current Plan
                </div>
              ) : t.priceMonthly === 0 ? (
                <div className="text-center text-[12px] text-muted-foreground py-3 rounded-xl border border-border">
                  Free — no payment needed
                </div>
              ) : (
                <button
                  disabled={
                    busyTierId === t.id || (isDowngrade && cancellationPending)
                  }
                  onClick={() =>
                    isDowngrade ? handleDowngrade(t) : handleUpgrade(t)
                  }
                  className="block w-full text-center text-[12px] font-bold py-3 rounded-xl transition-all active:scale-95 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: isDowngrade
                      ? "hsl(var(--secondary))"
                      : "hsl(20 100% 50%)",
                    color: isDowngrade ? "hsl(var(--foreground))" : "#000",
                  }}
                >
                  {busyTierId === t.id
                    ? "Working…"
                    : isDowngrade
                      ? `Downgrade to ${t.name} (next billing date) →`
                      : `Upgrade to ${t.name} — ${displayPrice} →`}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {currentTierId !== "basic" && (
        <div
          className="mk2-card"
          style={{ borderTop: "2px solid hsl(var(--border))" }}
        >
          <div className="font-bold text-sm mb-2 flex items-center gap-2">
            ⚙️ Manage Your Subscription
          </div>

          {cancellationPending ? (
            <div className="text-xs text-muted-foreground leading-relaxed">
              {pendingDowngradeTierName
                ? `Your plan is scheduled to change to ${pendingDowngradeTierName} at the end of your current billing period.`
                : "Your subscription is scheduled to end at the end of your current billing period. You'll then move to the Basic plan."}
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Cancelling stops future billing. You'll keep {currentTier.name}{" "}
                access until the end of your current billing period, then move
                to the Basic plan.
              </div>
              <button
                disabled={cancelling}
                onClick={handleCancel}
                className="inline-block text-[12px] font-bold py-2.5 px-5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background: "hsl(0 72% 51% / 0.1)",
                  color: "hsl(0 72% 51%)",
                  border: "1px solid hsl(0 72% 51% / 0.35)",
                }}
              >
                {cancelling ? "Cancelling…" : "Cancel Membership →"}
              </button>
            </>
          )}

          {/* <div className="mt-3">
            <a
              href="https://www.payfast.co.za/eng/recurring/manage"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground underline"
            >
              Or manage directly via PayFast →
            </a>
          </div> */}
        </div>
      )}

      <div className="mt-6 text-center text-[11px] text-muted-foreground">
        Plans and pricing are subject to change. Current subscribers will be
        notified of any changes in advance.
      </div>
    </div>
  );
}

// import { useState } from "react";
// import { useAuth } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { PageTitle } from "@/components/shared/PageTitle";
// import { motion } from "framer-motion";
// import { getFunctions, httpsCallable } from "firebase/functions";

// // ── PayFast sign endpoint — deployed Firebase Cloud Function (europe-west1) ──
// const BACKEND_URL =
//   "https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastSign";

// // ── Environment flag ──────────────────────────────────────────────────────────
// const IS_SANDBOX = import.meta.env.VITE_PAYFAST_SANDBOX !== "false";

// const functions = getFunctions(undefined, "europe-west1");

// // ── Plans ─────────────────────────────────────────────────────────────────────
// const TIERS = [
//   {
//     id: "basic",
//     name: "Basic",
//     priceMonthly: 0,
//     priceAnnual: 0,
//     priceLabel: "Free",
//     annualLabel: null,
//     color: "#9ca3af",
//     aiCredits: 0,
//     features: [
//       "Stay updated on MK2R events",
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements",
//       "Google Ads",
//       "Links to socials",
//       "Help articles",
//     ],
//     locked: [
//       "Push notifications",
//       "Community chat",
//       "Leaderboard",
//       "Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "AI Workout Planner",
//     ],
//     payfastItemName: null,
//   },
//   {
//     id: "silver",
//     name: "Silver",
//     priceMonthly: 24,
//     priceAnnual: 228,
//     priceLabel: "R24/mo",
//     annualLabel: "R228/yr",
//     color: "#cbd5e1",
//     aiCredits: 20,
//     features: [
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements / banners",
//       "Google Ads",
//       "Links to socials",
//       "Help articles",
//       "Push notifications",
//       "Community chat",
//       "Leaderboard",
//       "20 AI credits / month",
//     ],
//     locked: [
//       "Gym Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "No Google Ads",
//     ],
//     payfastItemName: "MK2R Silver Membership - Monthly",
//     payfastItemNameAnnual: "MK2R Silver Membership - Annual",
//   },
//   {
//     id: "gold",
//     name: "Gold",
//     priceMonthly: 54,
//     priceAnnual: 588,
//     priceLabel: "R54/mo",
//     annualLabel: "R588/yr",
//     color: "hsl(38 92% 50%)",
//     aiCredits: 100,
//     features: [
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements / banners",
//       "No Google Ads",
//       "Quick links to socials",
//       "Help articles",
//       "Push notifications",
//       "Community chat",
//       "Gym Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "AI Workout Planner",
//       "100 AI credits / month",
//     ],
//     locked: [],
//     payfastItemName: "MK2R Gold Membership - Monthly",
//     payfastItemNameAnnual: "MK2R Gold Membership - Annual",
//   },
// ] as const;

// type Tier = (typeof TIERS)[number];

// async function getSubscriptionUrl(
//   tier: Tier,
//   annual: boolean,
//   userEmail: string,
//   userName: string,
//   uid: string,
// ): Promise<string> {
//   const amount = annual ? tier.priceAnnual : tier.priceMonthly;
//   const itemName = annual
//     ? (tier as any).payfastItemNameAnnual
//     : tier.payfastItemName;

//   const res = await fetch(BACKEND_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       email_address: userEmail,
//       name_first: userName.split(" ")[0],
//       name_last: userName.split(" ").slice(1).join(" ") || "-",
//       item_name: itemName,
//       amount: amount.toFixed(2),
//       recurring_amount: amount.toFixed(2),
//       frequency: annual ? "6" : "3",
//       custom_str1: uid,
//       custom_str2: tier.id,
//       custom_str3: annual ? "yearly" : "monthly",
//     }),
//   });

//   const data = await res.json();
//   if (!data.url) throw new Error("Failed to get payment URL");
//   return data.url;
// }

// export function Membership({ setPage }: { setPage: (p: string) => void }) {
//   const { user } = useAuth();
//   const { isMobile } = useBreakpoint();
//   const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
//   const [busyTierId, setBusyTierId] = useState<string | null>(null);
//   const [cancelling, setCancelling] = useState(false);

//   if (!user) return null;

//   const aiCredits = (user as any).aiQuota?.remaining ?? 0;
//   const aiTotal = (user as any).aiQuota?.total ?? 0;
//   const currentTierId = (user as any).membership ?? "basic";
//   const currentTier = TIERS.find((t) => t.id === currentTierId) ?? TIERS[0];

//   const cancellationPending: boolean = !!(user as any).cancellationPending;
//   const pendingDowngradeTierId: string | null =
//     (user as any).pendingDowngrade?.tier ?? null;
//   const pendingDowngradeTierName = pendingDowngradeTierId
//     ? TIERS.find((t) => t.id === pendingDowngradeTierId)?.name ?? pendingDowngradeTierId
//     : null;

//   async function handleDowngrade(t: Tier) {
//     if (cancellationPending) {
//       alert(
//         "You already have a pending plan change. Resolve it below before scheduling another.",
//       );
//       return;
//     }
//     const confirmed = window.confirm(
//       `Your plan will switch to ${t.name} at the end of your current billing period. You'll keep ${currentTier.name} access until then. Continue?`,
//     );
//     if (!confirmed) return;

//     setBusyTierId(t.id);
//     try {
//       const scheduleDowngrade = httpsCallable(functions, "scheduleDowngrade");
//       await scheduleDowngrade({ targetTier: t.id });
//     } catch (err: any) {
//       alert(err?.message || "Failed to schedule downgrade. Please try again.");
//     } finally {
//       setBusyTierId(null);
//     }
//   }

//   async function handleUpgrade(t: Tier) {
//     setBusyTierId(t.id);
//     try {
//       const url = await getSubscriptionUrl(
//         t,
//         billing === "annual",
//         user.email,
//         user.name,
//         user.uid,
//       );
//       window.open(url, "_blank");
//     } catch (err) {
//       alert("Failed to load payment page. Please try again.");
//     } finally {
//       setBusyTierId(null);
//     }
//   }

//   async function handleCancel() {
//     const confirmed = window.confirm(
//       "Cancel your subscription? You'll keep access until the end of your current billing period, then move to the Basic plan.",
//     );
//     if (!confirmed) return;

//     setCancelling(true);
//     try {
//       const cancelSubscription = httpsCallable(functions, "cancelSubscription");
//       await cancelSubscription();
//     } catch (err: any) {
//       alert(err?.message || "Failed to cancel. Please try again.");
//     } finally {
//       setCancelling(false);
//     }
//   }

//   return (
//     <div
//       className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
//     >
//       <PageTitle sub="Choose the plan that works for you">
//         Gym <span className="text-primary">Membership</span>
//       </PageTitle>

//       {currentTierId !== "basic" && (
//         <div
//           className="mk2-card mb-5 flex items-center justify-between gap-4"
//           style={{ borderLeft: "3px solid hsl(20 100% 50%)" }}
//         >
//           <div>
//             <div className="font-bold text-sm mb-0.5">AI Credits</div>
//             <div className="text-xs text-muted-foreground">
//               Used for AI Workout Planner &amp; Nutrition Coach · resets on the
//               1st
//             </div>
//           </div>
//           <div className="text-right shrink-0">
//             <div className="font-display text-4xl text-primary">
//               {aiCredits}
//             </div>
//             <div className="text-[11px] text-muted-foreground">
//               / {aiTotal} remaining
//             </div>
//           </div>
//         </div>
//       )}

//       {cancellationPending && (
//         <div
//           className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-xs"
//           style={{
//             background: "hsl(38 92% 50% / 0.08)",
//             border: "1px solid hsl(38 92% 50% / 0.3)",
//             color: "hsl(38 92% 50%)",
//           }}
//         >
//           <span className="text-base shrink-0">⏳</span>
//           <span>
//             {pendingDowngradeTierName ? (
//               <>
//                 <strong>Plan change scheduled</strong> — you'll move to{" "}
//                 <strong>{pendingDowngradeTierName}</strong> at the end of your
//                 current billing period. You keep {currentTier.name} access
//                 until then.
//               </>
//             ) : (
//               <>
//                 <strong>Cancellation scheduled</strong> — you'll move to the
//                 Basic plan at the end of your current billing period.
//               </>
//             )}
//           </span>
//         </div>
//       )}

//       {IS_SANDBOX && (
//         <div
//           className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-xs"
//           style={{
//             background: "hsl(217 91% 53% / 0.08)",
//             border: "1px solid hsl(217 91% 53% / 0.25)",
//             color: "hsl(217 91% 53%)",
//           }}
//         >
//           <span className="text-base shrink-0">🔬</span>
//           <span>
//             <strong>Test mode active</strong> — payments go to PayFast Sandbox.
//             Use test card: <strong>4000000000000002</strong> · No real charges.
//           </span>
//         </div>
//       )}

//       <div className="flex items-center justify-center mb-8 gap-3">
//         <div
//           className="flex gap-1 p-1 rounded-xl"
//           style={{ background: "hsl(var(--secondary))" }}
//         >
//           {(["monthly", "annual"] as const).map((b) => (
//             <button
//               key={b}
//               onClick={() => setBilling(b)}
//               className="px-5 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer font-body flex items-center gap-2"
//               style={{
//                 background: billing === b ? "hsl(20 100% 50%)" : "transparent",
//                 color: billing === b ? "#000" : "hsl(var(--muted-foreground))",
//               }}
//             >
//               {b === "monthly" ? "Monthly" : "Annual"}
//               {b === "annual" && (
//                 <span
//                   className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
//                   style={{
//                     background:
//                       billing === "annual"
//                         ? "rgba(0,0,0,0.2)"
//                         : "hsl(142 72% 37% / 0.2)",
//                     color: billing === "annual" ? "#000" : "hsl(142 72% 37%)",
//                   }}
//                 >
//                   Save ~15%
//                 </span>
//               )}
//             </button>
//           ))}
//         </div>
//       </div>

//       <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mb-8">
//         {TIERS.map((t, i) => {
//           const isCurrent = t.id === currentTierId;
//           const isDowngrade =
//             currentTierId !== "basic" && t.priceMonthly < currentTier.priceMonthly;
//           const displayPrice =
//             t.priceMonthly === 0
//               ? "Free"
//               : billing === "annual"
//                 ? `R${t.priceAnnual}/yr`
//                 : `R${t.priceMonthly}/mo`;

//           return (
//             <motion.div
//               key={t.id}
//               initial={{ opacity: 0, y: 10 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ delay: i * 0.07 }}
//               className="bg-card rounded-2xl p-5 flex flex-col relative overflow-hidden"
//               style={{
//                 border: isCurrent
//                   ? `2px solid ${t.color}`
//                   : t.id === "gold"
//                     ? `1px solid ${t.color}50`
//                     : "1px solid hsl(var(--border))",
//                 boxShadow:
//                   t.id === "gold" ? `0 0 24px ${t.color}18` : undefined,
//               }}
//             >
//               {t.id === "gold" && (
//                 <div
//                   className="absolute top-0 left-0 right-0 h-0.5"
//                   style={{ background: t.color }}
//                 />
//               )}

//               {isCurrent && (
//                 <div
//                   className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                   style={{
//                     background: `${t.color}20`,
//                     color: t.color,
//                     border: `1px solid ${t.color}40`,
//                   }}
//                 >
//                   ✓ Current
//                 </div>
//               )}

//               <div
//                 className="font-display text-2xl mb-1"
//                 style={{ color: t.color }}
//               >
//                 {t.name}
//               </div>
//               <div className="font-bold text-2xl mb-0.5">{displayPrice}</div>
//               {billing === "annual" && t.annualLabel && (
//                 <div className="text-[11px] text-muted-foreground mb-4">
//                   billed annually · equiv. R{Math.round(t.priceAnnual / 12)}/mo
//                 </div>
//               )}
//               {billing === "monthly" && (
//                 <div className="text-[11px] text-muted-foreground mb-4">
//                   {t.priceMonthly === 0
//                     ? "No payment needed"
//                     : "billed monthly"}
//                 </div>
//               )}

//               {t.aiCredits > 0 && (
//                 <div
//                   className="self-start text-[11px] font-bold px-3 py-1 rounded-full mb-4 flex items-center gap-1.5"
//                   style={{
//                     background: "hsl(20 100% 50% / 0.1)",
//                     color: "hsl(20 100% 50%)",
//                     border: "1px solid hsl(20 100% 50% / 0.25)",
//                   }}
//                 >
//                   🤖 {t.aiCredits} AI credits/month
//                 </div>
//               )}

//               <div className="flex flex-col gap-1.5 mb-5 flex-1">
//                 {t.features.map((f) => (
//                   <div key={f} className="flex items-start gap-2 text-xs">
//                     <span className="text-green-400 mt-px shrink-0">✓</span>
//                     <span>{f}</span>
//                   </div>
//                 ))}
//                 {t.locked.map((f) => (
//                   <div
//                     key={f}
//                     className="flex items-start gap-2 text-xs text-muted-foreground line-through"
//                   >
//                     <span className="mt-px shrink-0">✕</span>
//                     <span>{f}</span>
//                   </div>
//                 ))}
//               </div>

//               {isCurrent ? (
//                 <div
//                   className="text-center text-[12px] font-bold py-3 rounded-xl"
//                   style={{ background: `${t.color}15`, color: t.color }}
//                 >
//                   ✓ Your Current Plan
//                 </div>
//               ) : t.priceMonthly === 0 ? (
//                 <div className="text-center text-[12px] text-muted-foreground py-3 rounded-xl border border-border">
//                   Free — no payment needed
//                 </div>
//               ) : (
//                 <button
//                   disabled={busyTierId === t.id || (isDowngrade && cancellationPending)}
//                   onClick={() => (isDowngrade ? handleDowngrade(t) : handleUpgrade(t))}
//                   className="block w-full text-center text-[12px] font-bold py-3 rounded-xl transition-all active:scale-95 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
//                   style={{
//                     background: isDowngrade
//                       ? "hsl(var(--secondary))"
//                       : "hsl(20 100% 50%)",
//                     color: isDowngrade ? "hsl(var(--foreground))" : "#000",
//                   }}
//                 >
//                   {busyTierId === t.id
//                     ? "Working…"
//                     : isDowngrade
//                       ? `Downgrade to ${t.name} (next billing date) →`
//                       : `Upgrade to ${t.name} — ${displayPrice} →`}
//                 </button>
//               )}
//             </motion.div>
//           );
//         })}
//       </div>

//       {currentTierId !== "basic" && (
//         <div
//           className="mk2-card"
//           style={{ borderTop: "2px solid hsl(var(--border))" }}
//         >
//           <div className="font-bold text-sm mb-2 flex items-center gap-2">
//             ⚙️ Manage Your Subscription
//           </div>

//           {cancellationPending ? (
//             <div className="text-xs text-muted-foreground leading-relaxed">
//               {pendingDowngradeTierName
//                 ? `Your plan is scheduled to change to ${pendingDowngradeTierName} at the end of your current billing period.`
//                 : "Your subscription is scheduled to end at the end of your current billing period. You'll then move to the Basic plan."}
//             </div>
//           ) : (
//             <>
//               <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
//                 Cancelling stops future billing. You'll keep {currentTier.name}{" "}
//                 access until the end of your current billing period, then
//                 move to the Basic plan.
//               </div>
//               <button
//                 disabled={cancelling}
//                 onClick={handleCancel}
//                 className="inline-block text-[12px] font-bold py-2.5 px-5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
//                 style={{
//                   background: "hsl(0 72% 51% / 0.1)",
//                   color: "hsl(0 72% 51%)",
//                   border: "1px solid hsl(0 72% 51% / 0.35)",
//                 }}
//               >
//                 {cancelling ? "Cancelling…" : "Cancel Membership →"}
//               </button>
//             </>
//           )}

//           <div className="mt-3">

//               href="https://www.payfast.co.za/eng/recurring/manage"
//               target="_blank"
//               rel="noopener noreferrer"
//               className="text-[11px] text-muted-foreground underline"
//             >
//               Or manage directly via PayFast →
//             </a>
//           </div>
//         </div>
//       )}

//       <div className="mt-6 text-center text-[11px] text-muted-foreground">
//         Plans and pricing are subject to change. Current subscribers will be
//         notified of any changes in advance.
//       </div>
//     </div>
//   );
// }

// import { useState } from "react";
// import { useAuth } from "@/context/AuthContext";
// import { useBreakpoint } from "@/hooks/useBreakpoint";
// import { PageTitle } from "@/components/shared/PageTitle";
// import { motion } from "framer-motion";

// // ── PayFast sandbox merchant details ─────────────────────────────────────────
// const PAYFAST_MERCHANT_ID = "10000100";
// const PAYFAST_MERCHANT_KEY = "46f0cd694581a";
// const PAYFAST_BASE = "https://sandbox.payfast.co.za/eng/process";
// // When live → "https://www.payfast.co.za/eng/process"

// const RETURN_URL = "https://gym-pro-20ee6.web.app";
// const CANCEL_URL = "https://gym-pro-20ee6.web.app";
// const NOTIFY_URL =
//   "https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastNotify";

// // ── Plans ─────────────────────────────────────────────────────────────────────
// const TIERS = [
//   {
//     id: "basic",
//     name: "Basic",
//     priceMonthly: 0,
//     priceAnnual: 0,
//     priceLabel: "Free",
//     annualLabel: null,
//     color: "#9ca3af",
//     aiCredits: 0,
//     features: [
//       "Stay updated on MK2R events",
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements",
//       "Google Ads",
//       "Links to socials",
//       "Help articles",
//     ],
//     locked: [
//       "Push notifications",
//       "Community chat",
//       "Leaderboard",
//       "Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "AI Workout Planner",
//     ],
//     payfastItemName: null,
//   },
//   {
//     id: "silver",
//     name: "Silver",
//     priceMonthly: 24,
//     priceAnnual: 288,
//     priceLabel: "R24/mo",
//     annualLabel: "R288/yr",
//     color: "#cbd5e1",
//     aiCredits: 20,
//     features: [
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements / banners",
//       "Google Ads",
//       "Links to socials",
//       "Help articles",
//       "Push notifications",
//       "Community chat",
//       "Leaderboard",
//       "20 AI credits / month",
//     ],
//     locked: [
//       "Gym Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "No Google Ads",
//     ],
//     payfastItemName: "MK2R Silver Membership - Monthly",
//     payfastItemNameAnnual: "MK2R Silver Membership - Annual",
//   },
//   {
//     id: "gold",
//     name: "Gold",
//     priceMonthly: 49,
//     priceAnnual: 588,
//     priceLabel: "R49/mo",
//     annualLabel: "R588/yr",
//     color: "hsl(38 92% 50%)",
//     aiCredits: 100,
//     features: [
//       "Book a class (Octiv link)",
//       "News & info",
//       "Events",
//       "Internal advertisements / banners",
//       "No Google Ads",
//       "Quick links to socials",
//       "Help articles",
//       "Push notifications",
//       "Community chat",
//       "Gym Loyalty card",
//       "Discount coupons",
//       "Body Tracker",
//       "AI Meal Plans",
//       "AI Workout Planner",
//       "100 AI credits / month",
//     ],
//     locked: [],
//     payfastItemName: "MK2R Gold Membership - Monthly",
//     payfastItemNameAnnual: "MK2R Gold Membership - Annual",
//   },
// ] as const;

// type Tier = (typeof TIERS)[number];

// // ── Build PayFast URL ─────────────────────────────────────────────────────────
// function buildPayFastUrl(params: Record<string, string>): string {
//   const qs = Object.entries({
//     merchant_id: PAYFAST_MERCHANT_ID,
//     merchant_key: PAYFAST_MERCHANT_KEY,
//     return_url: RETURN_URL,
//     cancel_url: CANCEL_URL,
//     ...params,
//   })
//     .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
//     .join("&");
//   return `${PAYFAST_BASE}?${qs}`;
// }

// function subscriptionUrl(
//   tier: Tier,
//   annual: boolean,
//   userEmail: string,
//   userName: string,
//   uid: string,
// ) {
//   const amount = annual ? tier.priceAnnual : tier.priceMonthly;
//   const itemName = annual
//     ? (tier as any).payfastItemNameAnnual
//     : tier.payfastItemName;
//   return buildPayFastUrl({
//     email_address: userEmail,
//     name_first: userName.split(" ")[0],
//     name_last: userName.split(" ").slice(1).join(" ") || "-",
//     item_name: itemName,
//     amount: amount.toFixed(2),
//     subscription_type: "1",
//     billing_date: new Date().toISOString().split("T")[0],
//     recurring_amount: amount.toFixed(2),
//     frequency: annual ? "6" : "3", // 6 = annual, 3 = monthly
//     cycles: "0",
//     notify_url: NOTIFY_URL,
//     custom_str1: uid,
//     custom_str2: tier.id,
//     custom_str4: "membership",
//   });
// }

// export function Membership({ setPage }: { setPage: (p: string) => void }) {
//   const { user } = useAuth();
//   const { isMobile } = useBreakpoint();
//   const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

//   if (!user) return null;

//   const aiCredits = (user as any).aiQuota?.remaining ?? 0;
//   const aiTotal = (user as any).aiQuota?.total ?? 0;
//   const currentTierId = (user as any).membership ?? "basic";
//   const currentTier = TIERS.find((t) => t.id === currentTierId) ?? TIERS[0];

//   return (
//     <div
//       className={`max-w-[1060px] mx-auto ${isMobile ? "px-3.5 py-5" : "px-6 py-10"}`}
//     >
//       <PageTitle sub="Choose the plan that works for you">
//         App <span className="text-primary">Subscription</span>
//       </PageTitle>

//       {/* ── AI credit balance ───────────────────────────────────────────── */}
//       {currentTierId !== "basic" && (
//         <div
//           className="mk2-card mb-5 flex items-center justify-between gap-4"
//           style={{ borderLeft: "3px solid hsl(20 100% 50%)" }}
//         >
//           <div>
//             <div className="font-bold text-sm mb-0.5">AI Credits</div>
//             <div className="text-xs text-muted-foreground">
//               Used for AI Workout Planner &amp; Nutrition Coach · resets on the
//               1st
//             </div>
//           </div>
//           <div className="text-right shrink-0">
//             <div className="font-display text-4xl text-primary">
//               {aiCredits}
//             </div>
//             <div className="text-[11px] text-muted-foreground">
//               / {aiTotal} remaining
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── Sandbox notice ──────────────────────────────────────────────── */}
//       <div
//         className="mb-5 rounded-xl px-4 py-3 flex items-center gap-3 text-xs"
//         style={{
//           background: "hsl(217 91% 53% / 0.08)",
//           border: "1px solid hsl(217 91% 53% / 0.25)",
//           color: "hsl(217 91% 53%)",
//         }}
//       >
//         <span className="text-base shrink-0">🔬</span>
//         <span>
//           <strong>Test mode active</strong> — payments go to PayFast Sandbox.
//           Use test card: <strong>4000000000000002</strong> · No real charges.
//         </span>
//       </div>

//       {/* ── Billing toggle ──────────────────────────────────────────────── */}
//       <div className="flex items-center justify-center mb-8 gap-3">
//         <div
//           className="flex gap-1 p-1 rounded-xl"
//           style={{ background: "hsl(var(--secondary))" }}
//         >
//           {(["monthly", "annual"] as const).map((b) => (
//             <button
//               key={b}
//               onClick={() => setBilling(b)}
//               className="px-5 py-2 rounded-lg text-sm font-bold transition-all border-none cursor-pointer font-body flex items-center gap-2"
//               style={{
//                 background: billing === b ? "hsl(20 100% 50%)" : "transparent",
//                 color: billing === b ? "#000" : "hsl(var(--muted-foreground))",
//               }}
//             >
//               {b === "monthly" ? "Monthly" : "Annual"}
//               {b === "annual" && (
//                 <span
//                   className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
//                   style={{
//                     background:
//                       billing === "annual"
//                         ? "rgba(0,0,0,0.2)"
//                         : "hsl(142 72% 37% / 0.2)",
//                     color: billing === "annual" ? "#000" : "hsl(142 72% 37%)",
//                   }}
//                 >
//                   Save ~15%
//                 </span>
//               )}
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* ── Plan cards ──────────────────────────────────────────────────── */}
//       <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 mb-8">
//         {TIERS.map((t, i) => {
//           const isCurrent = t.id === currentTierId;
//           const displayPrice =
//             t.priceMonthly === 0
//               ? "Free"
//               : billing === "annual"
//                 ? `R${t.priceAnnual}/yr`
//                 : `R${t.priceMonthly}/mo`;

//           return (
//             <motion.div
//               key={t.id}
//               initial={{ opacity: 0, y: 10 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ delay: i * 0.07 }}
//               className="bg-card rounded-2xl p-5 flex flex-col relative overflow-hidden"
//               style={{
//                 border: isCurrent
//                   ? `2px solid ${t.color}`
//                   : t.id === "gold"
//                     ? `1px solid ${t.color}50`
//                     : "1px solid hsl(var(--border))",
//                 boxShadow:
//                   t.id === "gold" ? `0 0 24px ${t.color}18` : undefined,
//               }}
//             >
//               {/* Gold glow strip */}
//               {t.id === "gold" && (
//                 <div
//                   className="absolute top-0 left-0 right-0 h-0.5"
//                   style={{ background: t.color }}
//                 />
//               )}

//               {isCurrent && (
//                 <div
//                   className="absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full"
//                   style={{
//                     background: `${t.color}20`,
//                     color: t.color,
//                     border: `1px solid ${t.color}40`,
//                   }}
//                 >
//                   ✓ Current
//                 </div>
//               )}

//               <div
//                 className="font-display text-2xl mb-1"
//                 style={{ color: t.color }}
//               >
//                 {t.name}
//               </div>
//               <div className="font-bold text-2xl mb-0.5">{displayPrice}</div>
//               {billing === "annual" && t.annualLabel && (
//                 <div className="text-[11px] text-muted-foreground mb-4">
//                   billed annually · equiv. R{Math.round(t.priceAnnual / 12)}/mo
//                 </div>
//               )}
//               {billing === "monthly" && (
//                 <div className="text-[11px] text-muted-foreground mb-4">
//                   {t.priceMonthly === 0
//                     ? "No payment needed"
//                     : "billed monthly"}
//                 </div>
//               )}

//               {/* AI credits badge */}
//               {t.aiCredits > 0 && (
//                 <div
//                   className="self-start text-[11px] font-bold px-3 py-1 rounded-full mb-4 flex items-center gap-1.5"
//                   style={{
//                     background: "hsl(20 100% 50% / 0.1)",
//                     color: "hsl(20 100% 50%)",
//                     border: "1px solid hsl(20 100% 50% / 0.25)",
//                   }}
//                 >
//                   🤖 {t.aiCredits} AI credits/month
//                 </div>
//               )}

//               {/* Features */}
//               <div className="flex flex-col gap-1.5 mb-5 flex-1">
//                 {t.features.map((f) => (
//                   <div key={f} className="flex items-start gap-2 text-xs">
//                     <span className="text-green-400 mt-px shrink-0">✓</span>
//                     <span>{f}</span>
//                   </div>
//                 ))}
//                 {t.locked.map((f) => (
//                   <div
//                     key={f}
//                     className="flex items-start gap-2 text-xs text-muted-foreground line-through"
//                   >
//                     <span className="mt-px shrink-0">✕</span>
//                     <span>{f}</span>
//                   </div>
//                 ))}
//               </div>

//               {/* CTA */}
//               {isCurrent ? (
//                 <div
//                   className="text-center text-[12px] font-bold py-3 rounded-xl"
//                   style={{ background: `${t.color}15`, color: t.color }}
//                 >
//                   ✓ Your Current Plan
//                 </div>
//               ) : t.priceMonthly === 0 ? (
//                 <div className="text-center text-[12px] text-muted-foreground py-3 rounded-xl border border-border">
//                   Free — no payment needed
//                 </div>
//               ) : (
//                 <a
//                   href={subscriptionUrl(
//                     t,
//                     billing === "annual",
//                     user.email,
//                     user.name,
//                     user.uid,
//                   )}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   className="block text-center text-[12px] font-bold py-3 rounded-xl transition-all active:scale-95"
//                   style={{
//                     background: "hsl(20 100% 50%)",
//                     color: "#000",
//                     textDecoration: "none",
//                   }}
//                 >
//                   {currentTier.priceMonthly > t.priceMonthly
//                     ? `Downgrade to ${t.name} →`
//                     : `Upgrade to ${t.name} — ${displayPrice} →`}
//                 </a>
//               )}
//             </motion.div>
//           );
//         })}
//       </div>

//       {/* ── Manage existing subscription ───────────────────────────────── */}
//       {currentTierId !== "basic" && (
//         <div
//           className="mk2-card"
//           style={{ borderTop: "2px solid hsl(var(--border))" }}
//         >
//           <div className="font-bold text-sm mb-2 flex items-center gap-2">
//             ⚙️ Manage Your Subscription
//           </div>
//           <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
//             To cancel or downgrade, manage your subscription via PayFast.
//             Changes take effect at the next billing date.
//           </div>
//           <a
//             href="https://www.payfast.co.za/eng/recurring/manage"
//             target="_blank"
//             rel="noopener noreferrer"
//             className="inline-block text-[12px] font-bold py-2.5 px-5 rounded-xl transition-all"
//             style={{
//               background: "hsl(var(--secondary))",
//               color: "hsl(var(--foreground))",
//               border: "1px solid hsl(var(--border))",
//               textDecoration: "none",
//             }}
//           >
//             Manage / Cancel via PayFast →
//           </a>
//         </div>
//       )}

//       {/* ── Plans subject to change note ───────────────────────────────── */}
//       <div className="mt-6 text-center text-[11px] text-muted-foreground">
//         Plans and pricing are subject to change. Current subscribers will be
//         notified of any changes in advance.
//       </div>
//     </div>
//   );
// }
