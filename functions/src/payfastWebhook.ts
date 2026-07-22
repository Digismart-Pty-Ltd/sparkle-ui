import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import type { Request, Response } from "express";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import axios from "axios";

if (!admin.apps.length) admin.initializeApp();

// ── Lazy db getter — avoids top-level admin.database() call ──────────────────
// Calling admin.database() at module load time crashes Cloud Run health checks
// because the database URL isn't available until the function actually runs.
function getDb() {
  return admin.database();
}

const PAYFAST_IPS = [
  "197.97.145.144",
  "197.97.145.145",
  "197.97.145.146",
  "197.97.145.147",
  "41.74.179.194",
];

// FIX: PAYFAST_ENV and PAYFAST_PASSPHRASE were being read from process.env
// but never declared in this function's `secrets` array below, so Firebase
// Functions v2 never mounted them into the environment at runtime — this
// function was silently always seeing an empty passphrase and unset env,
// which meant IS_SANDBOX was always true and signature validation would
// have rejected every real PayFast ITN. Both are now declared on the
// payfastWebhook onRequest config.
const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";

// ─────────────────────────────────────────────────────────────────────────────
// Main webhook handler
// ─────────────────────────────────────────────────────────────────────────────
export const payfastWebhook = onRequest(
  { region: "europe-west1", secrets: ["PAYFAST_PASSPHRASE", "PAYFAST_ENV"] },
  async (req: Request, res: Response) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const body: Record<string, string> = req.body;
    const db = getDb();

    try {
      // ── Step 1: IP whitelist ───────────────────────────────────────────────
      const clientIp =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req.socket.remoteAddress ??
        "";

      if (!IS_SANDBOX && !PAYFAST_IPS.some((ip) => clientIp.startsWith(ip))) {
        logger.warn("PayFast webhook: IP not whitelisted", { clientIp });
        res.status(403).send("Forbidden");
        return;
      }

      // ── Step 2: Signature validation ───────────────────────────────────────
      const passphrase = process.env.PAYFAST_PASSPHRASE ?? "";
      if (!validateSignature(body, passphrase)) {
        logger.warn("PayFast webhook: Invalid signature", { body });
        res.status(400).send("Invalid signature");
        return;
      }

      // ── Step 3: Validate with PayFast servers ──────────────────────────────
      const isValid = await validateWithPayFast(
        body,
        req.headers as Record<string, string>,
      );
      if (!isValid) {
        logger.warn("PayFast webhook: Server validation failed");
        res.status(400).send("Validation failed");
        return;
      }

      // ── Step 4: Extract fields ─────────────────────────────────────────────
      const {
        payment_status,
        custom_str1: recordId,
        custom_str2: flowType,
        custom_str3: userId,
        custom_int1: creditsStr,
        pf_payment_id,
      } = body;

      if (!recordId || !userId) {
        logger.error("PayFast webhook: Missing custom fields", { body });
        res.status(400).send("Missing fields");
        return;
      }

      // ── Step 5: Idempotency ────────────────────────────────────────────────
      const pendingSnap = await db.ref(`pending_bookings/${recordId}`).get();
      if (!pendingSnap.exists()) {
        logger.warn("PayFast webhook: Booking not found", { recordId });
        res.status(200).send("OK");
        return;
      }
      const pending = pendingSnap.val();
      if (pending.status === "confirmed" || pending.status === "failed") {
        logger.info("PayFast webhook: Already processed", { recordId });
        res.status(200).send("OK");
        return;
      }

      // ── Step 6: Handle payment status ─────────────────────────────────────
      if (payment_status === "COMPLETE") {
        if (flowType === "class_booking") {
          await confirmClassBooking(
            db,
            recordId,
            pending,
            userId,
            pf_payment_id,
          );
        } else if (flowType === "credit_pack") {
          const credits = parseInt(creditsStr ?? "0", 10);
          await confirmPackPurchase(
            db,
            recordId,
            pending,
            userId,
            credits,
            pf_payment_id,
          );
        }
      } else {
        await handlePaymentFailure(db, recordId, pending, flowType, userId);
      }

      res.status(200).send("OK");
    } catch (err) {
      logger.error("PayFast webhook: Unhandled error", err);
      res.status(500).send("Internal Server Error");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled cleanup — releases spots older than 15 min
// ─────────────────────────────────────────────────────────────────────────────
export const releaseStalePendingBookings = onSchedule(
  { schedule: "every 5 minutes", region: "europe-west1" },
  async () => {
    const db = getDb();
    const cutoff = Date.now() - 15 * 60 * 1000;
    const snap = await db
      .ref("pending_bookings")
      .orderByChild("status")
      .equalTo("pending_payment")
      .get();

    if (!snap.exists()) return;

    const stale = Object.entries(snap.val() as Record<string, any>).filter(
      ([, record]) => record.createdAt < cutoff,
    );

    for (const [id, record] of stale) {
      if (record.className && record.dateKey && record.userId) {
        const bKey = buildBookingKey(record.className, record.dateKey);
        await db.ref(`class_bookings/${bKey}/${record.userId}`).remove();
      }
      await db.ref(`pending_bookings/${id}`).update({
        status: "cancelled",
        cancelledAt: Date.now(),
        reason: "payment_timeout",
      });
      logger.info("Released stale pending booking", { id });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function confirmClassBooking(
  db: admin.database.Database,
  recordId: string,
  pending: any,
  userId: string,
  pfPaymentId: string,
): Promise<void> {
  const { className, dateKey, time, dateDisplay } = pending;
  const bKey = buildBookingKey(className, dateKey);

  await db.ref(`class_bookings/${bKey}/${userId}/status`).set("confirmed");
  await db.ref(`class_bookings/${bKey}/${userId}/confirmedAt`).set(Date.now());
  await db.ref(`pending_bookings/${recordId}`).update({
    status: "confirmed",
    confirmedAt: Date.now(),
    payfastPfPaymentId: pfPaymentId,
  });

  const userBookingsRef = db.ref(`mk2_users/${userId}/bookings`);
  const userBookingsSnap = await userBookingsRef.get();
  const existing: unknown[] = userBookingsSnap.val() ?? [];
  const alreadyListed = existing.some(
    (b: any) => b.name === className && b.dateKey === dateKey,
  );
  if (!alreadyListed) {
    await userBookingsRef.set([
      ...existing,
      { name: className, dateKey, displayDate: dateDisplay, time },
    ]);
  }
  logger.info("Class booking confirmed", {
    recordId,
    userId,
    className,
    dateKey,
  });
}

async function confirmPackPurchase(
  db: admin.database.Database,
  recordId: string,
  pending: any,
  userId: string,
  credits: number,
  pfPaymentId: string,
): Promise<void> {
  const credRef = db.ref(`mk2_users/${userId}/classCredits`);
  const credSnap = await credRef.get();
  const current = credSnap.exists() ? (credSnap.val() as number) : 0;

  await credRef.set(current + credits);
  await db.ref(`mk2_users/${userId}/creditHistory`).push({
    amount: credits,
    type: "pack_purchase",
    note: `Bought ${pending.className ?? "credit pack"} via PayFast`,
    timestamp: Date.now(),
    payfastBookingId: recordId,
    adminAssigned: false,
  });
  await db.ref(`pending_bookings/${recordId}`).update({
    status: "confirmed",
    confirmedAt: Date.now(),
    payfastPfPaymentId: pfPaymentId,
  });
  logger.info("Pack purchase confirmed", { recordId, userId, credits });
}

async function handlePaymentFailure(
  db: admin.database.Database,
  recordId: string,
  pending: any,
  flowType: string,
  userId: string,
): Promise<void> {
  if (flowType === "class_booking") {
    const { className, dateKey } = pending;
    const bKey = buildBookingKey(className, dateKey);
    await db.ref(`class_bookings/${bKey}/${userId}`).remove();
  }
  await db.ref(`pending_bookings/${recordId}`).update({
    status: "failed",
    failedAt: Date.now(),
  });
  logger.info("Payment failed — spot released", { recordId, userId });
}

function validateSignature(
  data: Record<string, string>,
  passphrase: string,
): boolean {
  const { signature, ...rest } = data;
  const paramString = Object.entries(rest)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`)
    .join("&");

  const stringWithPassphrase = passphrase
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim())}`
    : paramString;

  const expected = crypto
    .createHash("md5")
    .update(stringWithPassphrase)
    .digest("hex");

  return expected === signature;
}

async function validateWithPayFast(
  data: Record<string, string>,
  headers: Record<string, string>,
): Promise<boolean> {
  const pfHost = IS_SANDBOX
    ? "https://sandbox.payfast.co.za"
    : "https://www.payfast.co.za";

  try {
    const response = await axios.post(
      `${pfHost}/eng/query/validate`,
      new URLSearchParams(data).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": headers["user-agent"] ?? "",
          Accept: "*/*",
        },
        timeout: 10_000,
      },
    );
    return response.data === "VALID";
  } catch (err) {
    logger.error("PayFast server validation error", err);
    return false;
  }
}

function buildBookingKey(className: string, dateKey: string): string {
  return `${className.replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateKey}`;
}

// import { onRequest } from "firebase-functions/v2/https";
// import { onSchedule } from "firebase-functions/v2/scheduler";
// import { logger } from "firebase-functions";
// import type { Request, Response } from "express";
// import * as admin from "firebase-admin";
// import * as crypto from "crypto";
// import axios from "axios";

// if (!admin.apps.length) admin.initializeApp();

// // ── Lazy db getter — avoids top-level admin.database() call ──────────────────
// // Calling admin.database() at module load time crashes Cloud Run health checks
// // because the database URL isn't available until the function actually runs.
// function getDb() {
//   return admin.database();
// }

// const PAYFAST_IPS = [
//   "197.97.145.144",
//   "197.97.145.145",
//   "197.97.145.146",
//   "197.97.145.147",
//   "41.74.179.194",
// ];

// const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";

// // ─────────────────────────────────────────────────────────────────────────────
// // Main webhook handler
// // ─────────────────────────────────────────────────────────────────────────────
// export const payfastWebhook = onRequest(
//   { region: "europe-west1" },
//   async (req: Request, res: Response) => {
//     if (req.method !== "POST") {
//       res.status(405).send("Method Not Allowed");
//       return;
//     }

//     const body: Record<string, string> = req.body;
//     const db = getDb();

//     try {
//       // ── Step 1: IP whitelist ───────────────────────────────────────────────
//       const clientIp =
//         (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
//         req.socket.remoteAddress ??
//         "";

//       if (!IS_SANDBOX && !PAYFAST_IPS.some((ip) => clientIp.startsWith(ip))) {
//         logger.warn("PayFast webhook: IP not whitelisted", { clientIp });
//         res.status(403).send("Forbidden");
//         return;
//       }

//       // ── Step 2: Signature validation ───────────────────────────────────────
//       const passphrase = process.env.PAYFAST_PASSPHRASE ?? "";
//       if (!validateSignature(body, passphrase)) {
//         logger.warn("PayFast webhook: Invalid signature", { body });
//         res.status(400).send("Invalid signature");
//         return;
//       }

//       // ── Step 3: Validate with PayFast servers ──────────────────────────────
//       const isValid = await validateWithPayFast(
//         body,
//         req.headers as Record<string, string>,
//       );
//       if (!isValid) {
//         logger.warn("PayFast webhook: Server validation failed");
//         res.status(400).send("Validation failed");
//         return;
//       }

//       // ── Step 4: Extract fields ─────────────────────────────────────────────
//       const {
//         payment_status,
//         custom_str1: recordId,
//         custom_str2: flowType,
//         custom_str3: userId,
//         custom_int1: creditsStr,
//         pf_payment_id,
//       } = body;

//       if (!recordId || !userId) {
//         logger.error("PayFast webhook: Missing custom fields", { body });
//         res.status(400).send("Missing fields");
//         return;
//       }

//       // ── Step 5: Idempotency ────────────────────────────────────────────────
//       const pendingSnap = await db.ref(`pending_bookings/${recordId}`).get();
//       if (!pendingSnap.exists()) {
//         logger.warn("PayFast webhook: Booking not found", { recordId });
//         res.status(200).send("OK");
//         return;
//       }
//       const pending = pendingSnap.val();
//       if (pending.status === "confirmed" || pending.status === "failed") {
//         logger.info("PayFast webhook: Already processed", { recordId });
//         res.status(200).send("OK");
//         return;
//       }

//       // ── Step 6: Handle payment status ─────────────────────────────────────
//       if (payment_status === "COMPLETE") {
//         if (flowType === "class_booking") {
//           await confirmClassBooking(
//             db,
//             recordId,
//             pending,
//             userId,
//             pf_payment_id,
//           );
//         } else if (flowType === "credit_pack") {
//           const credits = parseInt(creditsStr ?? "0", 10);
//           await confirmPackPurchase(
//             db,
//             recordId,
//             pending,
//             userId,
//             credits,
//             pf_payment_id,
//           );
//         }
//       } else {
//         await handlePaymentFailure(db, recordId, pending, flowType, userId);
//       }

//       res.status(200).send("OK");
//     } catch (err) {
//       logger.error("PayFast webhook: Unhandled error", err);
//       res.status(500).send("Internal Server Error");
//     }
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// // Scheduled cleanup — releases spots older than 15 min
// // ─────────────────────────────────────────────────────────────────────────────
// export const releaseStalePendingBookings = onSchedule(
//   { schedule: "every 5 minutes", region: "europe-west1" },
//   async () => {
//     const db = getDb();
//     const cutoff = Date.now() - 15 * 60 * 1000;
//     const snap = await db
//       .ref("pending_bookings")
//       .orderByChild("status")
//       .equalTo("pending_payment")
//       .get();

//     if (!snap.exists()) return;

//     const stale = Object.entries(snap.val() as Record<string, any>).filter(
//       ([, record]) => record.createdAt < cutoff,
//     );

//     for (const [id, record] of stale) {
//       if (record.className && record.dateKey && record.userId) {
//         const bKey = buildBookingKey(record.className, record.dateKey);
//         await db.ref(`class_bookings/${bKey}/${record.userId}`).remove();
//       }
//       await db.ref(`pending_bookings/${id}`).update({
//         status: "cancelled",
//         cancelledAt: Date.now(),
//         reason: "payment_timeout",
//       });
//       logger.info("Released stale pending booking", { id });
//     }
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// // Helpers
// // ─────────────────────────────────────────────────────────────────────────────
// async function confirmClassBooking(
//   db: admin.database.Database,
//   recordId: string,
//   pending: any,
//   userId: string,
//   pfPaymentId: string,
// ): Promise<void> {
//   const { className, dateKey, time, dateDisplay } = pending;
//   const bKey = buildBookingKey(className, dateKey);

//   await db.ref(`class_bookings/${bKey}/${userId}/status`).set("confirmed");
//   await db.ref(`class_bookings/${bKey}/${userId}/confirmedAt`).set(Date.now());
//   await db.ref(`pending_bookings/${recordId}`).update({
//     status: "confirmed",
//     confirmedAt: Date.now(),
//     payfastPfPaymentId: pfPaymentId,
//   });

//   const userBookingsRef = db.ref(`mk2_users/${userId}/bookings`);
//   const userBookingsSnap = await userBookingsRef.get();
//   const existing: unknown[] = userBookingsSnap.val() ?? [];
//   const alreadyListed = existing.some(
//     (b: any) => b.name === className && b.dateKey === dateKey,
//   );
//   if (!alreadyListed) {
//     await userBookingsRef.set([
//       ...existing,
//       { name: className, dateKey, displayDate: dateDisplay, time },
//     ]);
//   }
//   logger.info("Class booking confirmed", {
//     recordId,
//     userId,
//     className,
//     dateKey,
//   });
// }

// async function confirmPackPurchase(
//   db: admin.database.Database,
//   recordId: string,
//   pending: any,
//   userId: string,
//   credits: number,
//   pfPaymentId: string,
// ): Promise<void> {
//   const credRef = db.ref(`mk2_users/${userId}/classCredits`);
//   const credSnap = await credRef.get();
//   const current = credSnap.exists() ? (credSnap.val() as number) : 0;

//   await credRef.set(current + credits);
//   await db.ref(`mk2_users/${userId}/creditHistory`).push({
//     amount: credits,
//     type: "pack_purchase",
//     note: `Bought ${pending.className ?? "credit pack"} via PayFast`,
//     timestamp: Date.now(),
//     payfastBookingId: recordId,
//     adminAssigned: false,
//   });
//   await db.ref(`pending_bookings/${recordId}`).update({
//     status: "confirmed",
//     confirmedAt: Date.now(),
//     payfastPfPaymentId: pfPaymentId,
//   });
//   logger.info("Pack purchase confirmed", { recordId, userId, credits });
// }

// async function handlePaymentFailure(
//   db: admin.database.Database,
//   recordId: string,
//   pending: any,
//   flowType: string,
//   userId: string,
// ): Promise<void> {
//   if (flowType === "class_booking") {
//     const { className, dateKey } = pending;
//     const bKey = buildBookingKey(className, dateKey);
//     await db.ref(`class_bookings/${bKey}/${userId}`).remove();
//   }
//   await db.ref(`pending_bookings/${recordId}`).update({
//     status: "failed",
//     failedAt: Date.now(),
//   });
//   logger.info("Payment failed — spot released", { recordId, userId });
// }

// function validateSignature(
//   data: Record<string, string>,
//   passphrase: string,
// ): boolean {
//   const { signature, ...rest } = data;
//   const paramString = Object.entries(rest)
//     .filter(([, v]) => v !== "")
//     .sort(([a], [b]) => a.localeCompare(b))
//     .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`)
//     .join("&");

//   const stringWithPassphrase = passphrase
//     ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim())}`
//     : paramString;

//   const expected = crypto
//     .createHash("md5")
//     .update(stringWithPassphrase)
//     .digest("hex");

//   return expected === signature;
// }

// async function validateWithPayFast(
//   data: Record<string, string>,
//   headers: Record<string, string>,
// ): Promise<boolean> {
//   const pfHost = IS_SANDBOX
//     ? "https://sandbox.payfast.co.za"
//     : "https://www.payfast.co.za";

//   try {
//     const response = await axios.post(
//       `${pfHost}/eng/query/validate`,
//       new URLSearchParams(data).toString(),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//           "User-Agent": headers["user-agent"] ?? "",
//           Accept: "*/*",
//         },
//         timeout: 10_000,
//       },
//     );
//     return response.data === "VALID";
//   } catch (err) {
//     logger.error("PayFast server validation error", err);
//     return false;
//   }
// }

// function buildBookingKey(className: string, dateKey: string): string {
//   return `${className.replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateKey}`;
// }
