import * as functions from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { callPayFastApi } from "./payfastApiClient";

if (!admin.apps.length) admin.initializeApp();

function db() {
  return admin.database();
}

const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";

// ── Valid membership tiers ────────────────────────────────────────────────────
// Kept as a simple set for input validation. Pricing itself lives only in
// Membership.tsx (frontend display) and payfastSign.ts (checkout amount) —
// this file never charges an amount directly, since every plan change here
// goes through PayFast's cancel endpoint, not a direct amount update.
const VALID_TIERS = new Set(["basic", "silver", "gold"]);

// Shared message for the "no PayFast subscription behind this tier" case —
// e.g. an admin manually set membership via Admin.tsx without the member
// ever going through PayFast checkout. This is expected, not a bug — there
// is genuinely nothing on PayFast's side to cancel or modify.
const NO_SUBSCRIPTION_MESSAGE =
  "Your membership isn't linked to an active PayFast subscription — it may have been set up manually. Please contact the gym to change or cancel your plan.";

export const cancelSubscription = onCall(
  {
    region: "europe-west1",
    secrets: ["PAYFAST_MERCHANT_ID", "PAYFAST_PASSPHRASE"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
    const user = userSnap.val();

    if (user?.cancellationPending) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A plan change is already pending.",
      );
    }

    const sub = user?.subscription;
    if (!sub?.pfToken) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        NO_SUBSCRIPTION_MESSAGE,
      );
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID!;
    const passphrase = process.env.PAYFAST_PASSPHRASE!;

    try {
      await callPayFastApi({
        merchantId,
        passphrase,
        method: "PUT",
        path: `/subscriptions/${sub.pfToken}/cancel`,
        sandbox: IS_SANDBOX,
      });
    } catch (err: any) {
      functions.logger.error("PayFast cancel failed", err?.message ?? err);
      throw new functions.https.HttpsError(
        "internal",
        "Could not cancel subscription with PayFast. Please try again or contact support.",
      );
    }

    // Do NOT flip membership to basic here — PayFast's own CANCELLED ITN
    // will fire shortly, and index.ts's payfastNotify handler applies the
    // actual tier change (to basic, since there's no pendingDowngrade set).
    // This just marks the UI state as "in progress" and records intent.
    await db().ref(`mk2_users/${uid}`).update({
      cancellationPending: true,
      cancellationRequestedAt: Date.now(),
      pendingDowngrade: null, // explicit: plain cancel, not a downgrade
    });
    await db().ref(`mk2_users/${uid}/subscription/status`).set("cancelling");

    functions.logger.info(
      "Subscription cancellation requested via PayFast API",
      {
        uid,
      },
    );
    return { success: true };
  },
);

export const scheduleDowngrade = onCall(
  {
    region: "europe-west1",
    secrets: ["PAYFAST_MERCHANT_ID", "PAYFAST_PASSPHRASE"],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }
    const { targetTier } = request.data as { targetTier: string };
    if (!targetTier || !VALID_TIERS.has(targetTier)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid targetTier",
      );
    }

    const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
    const user = userSnap.val();

    if (user?.cancellationPending) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "A plan change is already pending.",
      );
    }

    const sub = user?.subscription;
    if (!sub?.pfToken) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        NO_SUBSCRIPTION_MESSAGE,
      );
    }

    const billingCycle: "monthly" | "annual" =
      sub.billingCycle === "annual" ? "annual" : "monthly";

    const merchantId = process.env.PAYFAST_MERCHANT_ID!;
    const passphrase = process.env.PAYFAST_PASSPHRASE!;

    // Every plan change — including silver <-> gold, not just downgrade to
    // basic — cancels the current PayFast subscription outright. PayFast's
    // Subscriptions "update" endpoint only changes the billed AMOUNT, not
    // custom_str2 (the tier ID echoed back on every ITN), which means
    // index.ts would never learn about the tier change if we used it.
    // Cancelling and letting the confirmed CANCELLED ITN drive the tier
    // change (via pendingDowngrade, read in index.ts) keeps a single
    // source of truth for "what tier is this user on now."
    try {
      await callPayFastApi({
        merchantId,
        passphrase,
        method: "PUT",
        path: `/subscriptions/${sub.pfToken}/cancel`,
        sandbox: IS_SANDBOX,
      });
    } catch (err: any) {
      functions.logger.error(
        "PayFast cancel (for downgrade) failed",
        err?.message ?? err,
      );
      throw new functions.https.HttpsError(
        "internal",
        "Could not process plan change with PayFast. Please try again or contact support.",
      );
    }

    await db()
      .ref(`mk2_users/${uid}`)
      .update({
        cancellationPending: true,
        cancellationRequestedAt: Date.now(),
        pendingDowngrade: { tier: targetTier, billing: billingCycle },
      });
    await db().ref(`mk2_users/${uid}/subscription/status`).set("cancelling");

    functions.logger.info("Downgrade scheduled via PayFast cancel + ITN", {
      uid,
      targetTier,
    });
    return { success: true };
  },
);

// import * as functions from "firebase-functions/v2";
// import { onCall } from "firebase-functions/v2/https";
// import * as admin from "firebase-admin";
// import { callPayFastApi } from "./payfastApiClient";

// if (!admin.apps.length) admin.initializeApp();

// function db() {
//   return admin.database();
// }

// const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";

// // ── Valid membership tiers ────────────────────────────────────────────────────
// // Kept as a simple set for input validation. Pricing itself lives only in
// // Membership.tsx (frontend display) and payfastSign.ts (checkout amount) —
// // this file never charges an amount directly, since every plan change here
// // goes through PayFast's cancel endpoint, not a direct amount update.
// const VALID_TIERS = new Set(["basic", "silver", "gold"]);

// export const cancelSubscription = onCall(
//   {
//     region: "europe-west1",
//     secrets: ["PAYFAST_MERCHANT_ID", "PAYFAST_PASSPHRASE"],
//   },
//   async (request) => {
//     const uid = request.auth?.uid;
//     if (!uid) {
//       throw new functions.https.HttpsError("unauthenticated", "Not logged in");
//     }

//     const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//     const user = userSnap.val();

//     if (user?.cancellationPending) {
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "A plan change is already pending.",
//       );
//     }

//     const sub = user?.subscription;
//     if (!sub?.pfToken) {
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "No active PayFast subscription token found for this account.",
//       );
//     }

//     const merchantId = process.env.PAYFAST_MERCHANT_ID!;
//     const passphrase = process.env.PAYFAST_PASSPHRASE!;

//     try {
//       await callPayFastApi({
//         merchantId,
//         passphrase,
//         method: "PUT",
//         path: `/subscriptions/${sub.pfToken}/cancel`,
//         sandbox: IS_SANDBOX,
//       });
//     } catch (err: any) {
//       functions.logger.error("PayFast cancel failed", err?.message ?? err);
//       throw new functions.https.HttpsError(
//         "internal",
//         "Could not cancel subscription with PayFast. Please try again or contact support.",
//       );
//     }

//     // Do NOT flip membership to basic here — PayFast's own CANCELLED ITN
//     // will fire shortly, and index.ts's payfastNotify handler applies the
//     // actual tier change (to basic, since there's no pendingDowngrade set).
//     // This just marks the UI state as "in progress" and records intent.
//     await db().ref(`mk2_users/${uid}`).update({
//       cancellationPending: true,
//       cancellationRequestedAt: Date.now(),
//       pendingDowngrade: null, // explicit: plain cancel, not a downgrade
//     });
//     await db().ref(`mk2_users/${uid}/subscription/status`).set("cancelling");

//     functions.logger.info(
//       "Subscription cancellation requested via PayFast API",
//       {
//         uid,
//       },
//     );
//     return { success: true };
//   },
// );

// export const scheduleDowngrade = onCall(
//   {
//     region: "europe-west1",
//     secrets: ["PAYFAST_MERCHANT_ID", "PAYFAST_PASSPHRASE"],
//   },
//   async (request) => {
//     const uid = request.auth?.uid;
//     if (!uid) {
//       throw new functions.https.HttpsError("unauthenticated", "Not logged in");
//     }
//     const { targetTier } = request.data as { targetTier: string };
//     if (!targetTier || !VALID_TIERS.has(targetTier)) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "Invalid targetTier",
//       );
//     }

//     const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//     const user = userSnap.val();

//     if (user?.cancellationPending) {
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "A plan change is already pending.",
//       );
//     }

//     const sub = user?.subscription;
//     if (!sub?.pfToken) {
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "No active PayFast subscription token found for this account.",
//       );
//     }

//     const billingCycle: "monthly" | "annual" =
//       sub.billingCycle === "annual" ? "annual" : "monthly";

//     const merchantId = process.env.PAYFAST_MERCHANT_ID!;
//     const passphrase = process.env.PAYFAST_PASSPHRASE!;

//     // Every plan change — including silver <-> gold, not just downgrade to
//     // basic — cancels the current PayFast subscription outright. PayFast's
//     // Subscriptions "update" endpoint only changes the billed AMOUNT, not
//     // custom_str2 (the tier ID echoed back on every ITN), which means
//     // index.ts would never learn about the tier change if we used it.
//     // Cancelling and letting the confirmed CANCELLED ITN drive the tier
//     // change (via pendingDowngrade, read in index.ts) keeps a single
//     // source of truth for "what tier is this user on now."
//     try {
//       await callPayFastApi({
//         merchantId,
//         passphrase,
//         method: "PUT",
//         path: `/subscriptions/${sub.pfToken}/cancel`,
//         sandbox: IS_SANDBOX,
//       });
//     } catch (err: any) {
//       functions.logger.error(
//         "PayFast cancel (for downgrade) failed",
//         err?.message ?? err,
//       );
//       throw new functions.https.HttpsError(
//         "internal",
//         "Could not process plan change with PayFast. Please try again or contact support.",
//       );
//     }

//     await db()
//       .ref(`mk2_users/${uid}`)
//       .update({
//         cancellationPending: true,
//         cancellationRequestedAt: Date.now(),
//         pendingDowngrade: { tier: targetTier, billing: billingCycle },
//       });
//     await db().ref(`mk2_users/${uid}/subscription/status`).set("cancelling");

//     functions.logger.info("Downgrade scheduled via PayFast cancel + ITN", {
//       uid,
//       targetTier,
//     });
//     return { success: true };
//   },
// );
