import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

function getDb() {
  return admin.database();
}

const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";
const PF_BASE = IS_SANDBOX
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process";

const FRONTEND_URL =
  process.env.FRONTEND_URL ?? "https://gym-pro-20ee6.web.app";
const NOTIFY_URL =
  "https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastNotify";

// ── Single shared encoder ─────────────────────────────────────────────────
// FIX: previously the signature was built with this manual encoder, but the
// final URL sent to PayFast was built with `new URLSearchParams(...).toString()`.
// encodeURIComponent() and URLSearchParams use different escaping rules for
// the characters ! ' ( ) * — URLSearchParams percent-encodes them,
// encodeURIComponent leaves them literal — and URLSearchParams doesn't trim
// values the way this encoder does either. Any field containing one of
// those characters (or stray whitespace) made the signed string and the
// actually-transmitted string diverge, so PayFast's server-side signature
// check failed with "Generated signature does not match submitted signature."
// Fix: use this exact same function to build BOTH the signature input and
// the final query string, so they are byte-for-byte identical.
function pfEncode(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

function buildParamString(data: Record<string, string>): string {
  return Object.entries(data)
    .filter(([, v]) => v !== "" && v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${pfEncode(v)}`)
    .join("&");
}

function generateSignature(
  data: Record<string, string>,
  passphrase: string,
): string {
  const paramString = buildParamString(data);
  const stringWithPassphrase = passphrase
    ? `${paramString}&passphrase=${pfEncode(passphrase)}`
    : paramString;

  // ── TEMPORARY DIAGNOSTIC LOGGING — remove once signature issue is fixed ──
  // Logs the exact string being hashed (passphrase redacted) and the
  // resulting signature, so we can inspect the real payload PayFast is
  // rejecting instead of guessing blind.
  logger.info("payfastSign DEBUG: paramString (no passphrase) =", {
    paramString,
  });
  const signature = crypto
    .createHash("md5")
    .update(stringWithPassphrase)
    .digest("hex");
  logger.info("payfastSign DEBUG: final signature =", { signature });
  return signature;
}

export const payfastSign = onRequest(
  {
    region: "europe-west1",
    secrets: [
      "PAYFAST_MERCHANT_ID",
      "PAYFAST_MERCHANT_KEY",
      "PAYFAST_PASSPHRASE",
    ],
    cors: true,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE ?? "";

    if (!merchantId || !merchantKey) {
      logger.error("payfastSign: merchant credentials not configured");
      res.status(500).json({ error: "Payment gateway not configured" });
      return;
    }

    const {
      email_address,
      name_first,
      name_last,
      item_name,
      amount,
      recurring_amount,
      frequency,
      custom_str1: uid,
      custom_str2: tierId,
      custom_str3: billingCycle,
    } = req.body as Record<string, string>;

    if (!email_address || !item_name || !amount || !uid || !tierId) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Record intent so payfastNotify can confirm it and store the token
    const db = getDb();
    const intentRef = db.ref("pending_subscriptions").push();
    const intentId = intentRef.key!;
    await intentRef.set({
      uid,
      tierId,
      billingCycle: billingCycle ?? "monthly",
      amount: parseFloat(amount),
      status: "pending",
      createdAt: Date.now(),
    });

    const params: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: `${FRONTEND_URL}/membership?status=success&intentId=${intentId}`,
      cancel_url: `${FRONTEND_URL}/membership?status=cancelled`,
      notify_url: NOTIFY_URL,
      email_address,
      name_first: name_first ?? "",
      name_last: name_last ?? "-",
      item_name,
      amount: Number(amount).toFixed(2),
      subscription_type: "1",
      billing_date: new Date().toISOString().split("T")[0],
      recurring_amount: Number(recurring_amount ?? amount).toFixed(2),
      frequency: frequency ?? "3",
      cycles: "0",
      custom_str1: uid,
      custom_str2: tierId,
      custom_str3: intentId,
      custom_str4: "membership",
    };

    const signature = generateSignature(params, passphrase);

    // FIX: build the final query string with the SAME encoder used above,
    // not URLSearchParams, so it's guaranteed to match what was signed.
    const qs = `${buildParamString(params)}&signature=${signature}`;

    res.status(200).json({ url: `${PF_BASE}?${qs}` });
  },
);

// import { onRequest } from "firebase-functions/v2/https";
// import { logger } from "firebase-functions";
// import * as admin from "firebase-admin";
// import * as crypto from "crypto";

// if (!admin.apps.length) admin.initializeApp();

// function getDb() {
//   return admin.database();
// }

// const IS_SANDBOX = process.env.PAYFAST_ENV !== "production";
// const PF_BASE = IS_SANDBOX
//   ? "https://sandbox.payfast.co.za/eng/process"
//   : "https://www.payfast.co.za/eng/process";

// const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://gym-pro-20ee6.web.app";
// const NOTIFY_URL =
//   "https://europe-west1-gym-pro-20ee6.cloudfunctions.net/payfastNotify";

// function generateSignature(
//   data: Record<string, string>,
//   passphrase: string,
// ): string {
//   const paramString = Object.entries(data)
//     .filter(([, v]) => v !== "" && v !== undefined && v !== null)
//     .map(([k, v]) => `${k}=${encodeURIComponent(v.trim()).replace(/%20/g, "+")}`)
//     .join("&");

//   const stringWithPassphrase = passphrase
//     ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`
//     : paramString;

//   return crypto.createHash("md5").update(stringWithPassphrase).digest("hex");
// }

// export const payfastSign = onRequest(
//   {
//     region: "europe-west1",
//     secrets: ["PAYFAST_MERCHANT_ID", "PAYFAST_MERCHANT_KEY", "PAYFAST_PASSPHRASE"],
//     cors: true,
//   },
//   async (req, res) => {
//     if (req.method !== "POST") {
//       res.status(405).send("Method Not Allowed");
//       return;
//     }

//     const merchantId = process.env.PAYFAST_MERCHANT_ID;
//     const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
//     const passphrase = process.env.PAYFAST_PASSPHRASE ?? "";

//     if (!merchantId || !merchantKey) {
//       logger.error("payfastSign: merchant credentials not configured");
//       res.status(500).json({ error: "Payment gateway not configured" });
//       return;
//     }

//     const {
//       email_address,
//       name_first,
//       name_last,
//       item_name,
//       amount,
//       recurring_amount,
//       frequency,
//       custom_str1: uid,
//       custom_str2: tierId,
//       custom_str3: billingCycle,
//     } = req.body as Record<string, string>;

//     if (!email_address || !item_name || !amount || !uid || !tierId) {
//       res.status(400).json({ error: "Missing required fields" });
//       return;
//     }

//     // Record intent so payfastNotify can confirm it and store the token
//     const db = getDb();
//     const intentRef = db.ref("pending_subscriptions").push();
//     const intentId = intentRef.key!;
//     await intentRef.set({
//       uid,
//       tierId,
//       billingCycle: billingCycle ?? "monthly",
//       amount: parseFloat(amount),
//       status: "pending",
//       createdAt: Date.now(),
//     });

//     const params: Record<string, string> = {
//       merchant_id: merchantId,
//       merchant_key: merchantKey,
//       return_url: `${FRONTEND_URL}/membership?status=success&intentId=${intentId}`,
//       cancel_url: `${FRONTEND_URL}/membership?status=cancelled`,
//       notify_url: NOTIFY_URL,
//       email_address,
//       name_first: name_first ?? "",
//       name_last: name_last ?? "-",
//       item_name,
//       amount: Number(amount).toFixed(2),
//       subscription_type: "1",
//       billing_date: new Date().toISOString().split("T")[0],
//       recurring_amount: Number(recurring_amount ?? amount).toFixed(2),
//       frequency: frequency ?? "3",
//       cycles: "0",
//       custom_str1: uid,
//       custom_str2: tierId,
//       custom_str3: intentId,
//       custom_str4: "membership",
//     };

//     const signature = generateSignature(params, passphrase);
//     const qs = new URLSearchParams({ ...params, signature }).toString();

//     res.status(200).json({ url: `${PF_BASE}?${qs}` });
//   },
// );
