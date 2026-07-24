import * as functions from "firebase-functions/v2";
import { onRequest, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
// import { defineSecret, defineString } from "firebase-functions/params";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

// ── Exports for modularised functions ──────────────────────────────────────
export { payfastSign } from "./payfastSign";
export {
  cancelSubscription,
  scheduleDowngrade,
} from "./subscriptionManagement";
// payfastWebhook retired — payfastNotify below is now the single consolidated
// webhook for class_booking, credits, and membership. releaseStalePendingBookings
// (the scheduled cleanup) is still needed and lives in the same file.
export { releaseStalePendingBookings } from "./payfastWebhook";

// import * as nodemailer from "nodemailer"; // re-enable once email is set up

admin.initializeApp();

function db() {
  return admin.database();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Secrets & config — nothing sensitive lives in code or a .env file.
//  Set these once with:
//    firebase functions:secrets:set PAYFAST_MERCHANT_ID
//    firebase functions:secrets:set PAYFAST_MERCHANT_KEY
//    firebase functions:secrets:set PAYFAST_PASSPHRASE
//    firebase functions:secrets:set EMAIL_USER
//    firebase functions:secrets:set EMAIL_PASS
//  (OPENAI_API_KEY is a separate secret already used by aiChat below.)
//
//  PAYFAST_ENV and FRONTEND_URL are plain (non-secret) config values, set via
//  functions/.env.gym-pro-20ee6:
//    PAYFAST_ENV=production
//    FRONTEND_URL=<your real custom domain once DNS is live>
// ─────────────────────────────────────────────────────────────────────────────
const PAYFAST_MERCHANT_ID = defineSecret("PAYFAST_MERCHANT_ID");
const PAYFAST_MERCHANT_KEY = defineSecret("PAYFAST_MERCHANT_KEY");
const PAYFAST_PASSPHRASE = defineSecret("PAYFAST_PASSPHRASE");
// ── Email disabled for now — waiting on Gmail 2FA / app password setup ──────
// Uncomment these two lines once EMAIL_USER and EMAIL_PASS secrets are set:
// const EMAIL_USER = defineSecret("EMAIL_USER");
// const EMAIL_PASS = defineSecret("EMAIL_PASS");

// const FRONTEND_URL = defineString("FRONTEND_URL", {
//   default: "https://webapp.mktworiversfitness.co.za/",
// });

const PAYFAST_HOST = "https://www.payfast.co.za";

const PAYFAST_IPS = [
  "197.97.145.144",
  "197.97.145.145",
  "197.97.145.146",
  "197.97.145.147",
  "41.74.179.194",
  "41.74.179.195",
  "41.74.179.196",
  "41.74.179.197",
];

const PAYFAST_SECRETS = [
  PAYFAST_MERCHANT_ID,
  PAYFAST_MERCHANT_KEY,
  PAYFAST_PASSPHRASE,
  // EMAIL_USER, EMAIL_PASS — re-add once email is set up
];

// ─────────────────────────────────────────────────────────────────────────────
//  Email helper — transporter built lazily so secret values are read at
//  request time, not at module load time.
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, text: string) {
  // ── EMAIL DISABLED ──────────────────────────────────────────────────────
  console.log(`📧 [email disabled] Would have sent "${subject}" to ${to}`);
  return;

  /*
  if (!to) return;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER.value(),
        pass: EMAIL_PASS.value(),
      },
    });
    await transporter.sendMail({
      from: `"MK2 Fitness" <${EMAIL_USER.value()}>`,
      to,
      subject,
      text,
    });
    console.log("📧 Email sent to:", to);
  } catch (err: any) {
    console.error("Email error:", err.message);
  }
  */
}

// ─────────────────────────────────────────────────────────────────────────────
//  AI Chat (OpenAI) — unchanged from your live file
// ─────────────────────────────────────────────────────────────────────────────
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

const QUOTA: Record<string, number> = {
  unlimited_12m: 100,
  unlimited_6m: 100,
  unlimited_m2m: 100,
  hybrid_12m: 20,
  hybrid_6m: 20,
  hybrid_m2m: 20,
  u18: 20,
  gold: 100,
  silver: 20,
  basic: 0,
};

function nextMonthFirst(): number {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function checkAndIncrementQuota(uid: string): Promise<number> {
  const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
  const user = userSnap.val();
  if (!user)
    throw new functions.https.HttpsError("not-found", "User not found");

  const membership = user.membership ?? "basic";

  if (membership === "basic") {
    throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
  }

  const total = QUOTA[membership] ?? 0;
  if (total === 0) {
    throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
  }

  const quotaRef = db().ref(`mk2_users/${uid}/aiQuota`);
  const quotaSnap = await quotaRef.once("value");
  let quota = quotaSnap.val() as {
    remaining: number;
    total: number;
    resetDate: number;
  } | null;

  const now = Date.now();
  if (!quota || !quota.resetDate || now >= quota.resetDate) {
    quota = { remaining: total, total, resetDate: nextMonthFirst() };
  }

  if (quota.remaining <= 0) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "QUOTA_EXCEEDED",
    );
  }

  const newRemaining = quota.remaining - 1;
  await quotaRef.set({
    remaining: newRemaining,
    total: quota.total,
    resetDate: quota.resetDate,
  });

  return newRemaining;
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  messages: any[],
): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1500,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenAI API error:", response.status, err);
    throw new functions.https.HttpsError(
      "internal",
      `OpenAI API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  if (!text) {
    throw new functions.https.HttpsError("internal", "EMPTY_RESPONSE");
  }

  return text;
}

export const aiChat = onCall(
  {
    region: "europe-west1",
    secrets: ["OPENAI_API_KEY"],
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Not logged in");
    }

    const { mode, prompt, systemPrompt, fileData, mediaType, isPDF } =
      request.data as {
        mode: string;
        prompt?: string;
        systemPrompt?: string;
        fileData?: string;
        mediaType?: string;
        isPDF?: boolean;
      };

    const quotaRemaining = await checkAndIncrementQuota(uid);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError(
        "internal",
        "API key not configured",
      );
    }

    const sysPrompt =
      systemPrompt ||
      "You are a helpful fitness assistant at MK2 Rivers Fitness, South Africa.";

    if (mode === "inbody_extract") {
      if (!fileData || !mediaType) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "fileData and mediaType are required for inbody_extract mode",
        );
      }

      if (isPDF) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "PDF extraction is not supported with the current AI provider — please upload an image instead.",
        );
      }

      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                prompt ||
                `Extract InBody values as JSON with keys: weight, bodyFat, muscleMass, fatMass, visceralFat, totalBodyWater. Respond ONLY with the JSON object.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${fileData}` },
            },
          ],
        },
      ];

      const response = await callOpenAI(apiKey, sysPrompt, messages);
      return { response, quotaRemaining };
    }

    if (!prompt) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "prompt is required for this mode",
      );
    }

    const messages = [{ role: "user", content: prompt }];
    const response = await callOpenAI(apiKey, sysPrompt, messages);
    return { response, quotaRemaining };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  Notification helpers — unchanged from your live file
// ─────────────────────────────────────────────────────────────────────────────

async function writeNotification(
  uid: string,
  title: string,
  body: string,
  link?: string,
) {
  await db()
    .ref(`users/${uid}/notifications`)
    .push({
      title,
      body,
      message: body,
      timestamp: Date.now(),
      read: false,
      createdAt: Date.now(),
      ...(link ? { link } : {}),
    });
}

async function writeNotificationForAll(
  uidTokenPairs: { uid: string }[],
  title: string,
  body: string,
  link?: string,
) {
  const writes = uidTokenPairs.map(({ uid }) =>
    writeNotification(uid, title, body, link),
  );
  await Promise.all(writes);
}

async function getUserToken(uid: string): Promise<string | null> {
  const snap = await db().ref(`mk2_users/${uid}/fcmToken`).once("value");
  return snap.val() as string | null;
}

async function getUserPrefs(uid: string): Promise<Record<string, boolean>> {
  const snap = await db()
    .ref(`mk2_users/${uid}/notificationPrefs`)
    .once("value");
  return snap.val() || {};
}

async function sendToTokens(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) return;

  const unique = [...new Set(tokens.filter(Boolean))];
  if (unique.length === 0) return;

  const message: admin.messaging.MulticastMessage = {
    notification: { title, body },
    tokens: unique,
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  const cleanupPromises: Promise<any>[] = [];
  response.responses.forEach((resp, idx) => {
    if (
      !resp.success &&
      (resp.error?.code === "messaging/invalid-registration-token" ||
        resp.error?.code === "messaging/registration-token-not-registered")
    ) {
      const badToken = unique[idx];
      cleanupPromises.push(
        db()
          .ref("mk2_users")
          .once("value")
          .then((snap) =>
            snap.forEach((user) => {
              if (user.child("fcmToken").val() === badToken) {
                user.ref.child("fcmToken").remove();
              }
            }),
          ),
      );
    }
  });

  await Promise.all(cleanupPromises);
}

async function sendToUser(
  uid: string,
  title: string,
  body: string,
  link?: string,
) {
  const token = await getUserToken(uid);
  await writeNotification(uid, title, body, link);
  if (token) await sendToTokens([token], title, body);
  console.log(`Notification sent + written for ${uid}`);
}

async function sendToAllUsers(
  title: string,
  body: string,
  prefKey?: string,
  link?: string,
) {
  const usersSnap = await db().ref("mk2_users").once("value");
  const tokens: string[] = [];
  const eligibleUids: { uid: string }[] = [];

  usersSnap.forEach((user) => {
    if (!user.key) return;
    if (prefKey) {
      const prefs = user.child("notificationPrefs").val() || {};
      if (prefs[prefKey] === false) return;
    }
    eligibleUids.push({ uid: user.key });
    const token = user.child("fcmToken").val() as string | null;
    if (token) tokens.push(token);
  });

  await writeNotificationForAll(eligibleUids, title, body, link);
  await sendToTokens(tokens, title, body);
}

// ─────────────────────────────────────────────────────────────────────────────
//  PayFast ITN-verification signature helper.
//  NOTE: this verifies INCOMING PayFast notifications. It is intentionally
//  separate from the OUTBOUND request-signing logic in payfastApiClient.ts,
//  which builds signatures for calls we make TO PayFast's Subscriptions API.
//  Do not merge these — they sign different things for different purposes.
// ─────────────────────────────────────────────────────────────────────────────
function generateSignature(
  data: Record<string, string>,
  passphrase = "",
): string {
  const pfData = { ...data };

  if (passphrase && passphrase.trim() !== "") {
    (pfData as any).passphrase = passphrase.trim();
  }

  const str = Object.keys(pfData)
    .sort()
    .map(
      (k) =>
        `${k}=${encodeURIComponent(String(pfData[k])).replace(/%20/g, "+")}`,
    )
    .join("&");

  return crypto.createHash("md5").update(str).digest("hex");
}

// Fallback lookup by email if custom_str1 (uid) doesn't resolve to a user
async function findUserRef(
  userId: string | undefined,
  email: string | undefined,
): Promise<{ ref: admin.database.Reference; key: string } | null> {
  if (userId) {
    const snap = await db().ref(`mk2_users/${userId}`).get();
    if (snap.exists())
      return { ref: db().ref(`mk2_users/${userId}`), key: userId };
  }
  if (email) {
    const snap = await db()
      .ref("mk2_users")
      .orderByChild("email")
      .equalTo(email)
      .limitToFirst(1)
      .get();
    if (snap.exists()) {
      const key = Object.keys(snap.val())[0];
      return { ref: db().ref(`mk2_users/${key}`), key };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Existing triggers — unchanged from your live file
// ─────────────────────────────────────────────────────────────────────────────

export const onClassBookingCreate = functions.database.onValueCreated(
  {
    ref: "/class_bookings/{classDay}/{userId}",
    instance: "gym-pro-20ee6-default-rtdb",
    region: "europe-west1",
  },
  async (event: any) => {
    const userId = event.params.userId;
    const classDay = event.params.classDay;
    const bookingData = event.data.val();

    if (bookingData?.paid === true) {
      console.log(
        `onClassBookingCreate: skipping paid booking for ${userId} — payfastNotify handles notification`,
      );
      return null;
    }

    const prefs = await getUserPrefs(userId);
    if (prefs.classReminders === false) return null;

    await sendToUser(
      userId,
      "Class Booking Confirmed 🏋️",
      `You are booked for the class on ${classDay}. See you there!`,
      "classes",
    );
    return null;
  },
);

export const onMessageCreate = functions.database.onValueCreated(
  {
    ref: "/rooms/{roomId}/messages/{messageId}",
    instance: "gym-pro-20ee6-default-rtdb",
    region: "europe-west1",
  },
  async (event: any) => {
    const roomId = event.params.roomId;
    const message = event.data.val() as {
      uid: string;
      user?: string;
      text?: string;
    };
    if (!message) return null;

    const usersSnap = await db().ref("mk2_users").once("value");
    const tokens: string[] = [];
    const eligibleUids: { uid: string }[] = [];

    usersSnap.forEach((user) => {
      if (!user.key || user.key === message.uid) return;
      const prefs = user.child("notificationPrefs").val() || {};
      if (prefs.community === false) return;
      const joinedRooms = user.child("joinedRooms").val() || {};
      if (!joinedRooms[roomId]) return;
      eligibleUids.push({ uid: user.key });
      const token = user.child("fcmToken").val() as string | null;
      if (token) tokens.push(token);
    });

    const title = `💬 New message in ${roomId}`;
    const body = message.text
      ? `${message.user || "Someone"}: ${message.text.slice(0, 100)}`
      : `${message.user || "Someone"} sent a file`;

    await writeNotificationForAll(eligibleUids, title, body, "community");
    await sendToTokens(tokens, title, body);
    return null;
  },
);

export const onPollCreate = functions.database.onValueCreated(
  {
    ref: "/rooms/{roomId}/polls/{pollId}",
    instance: "gym-pro-20ee6-default-rtdb",
    region: "europe-west1",
  },
  async (event: any) => {
    const poll = event.data.val() as { uid: string; question?: string };
    const roomId = event.params.roomId;
    if (!poll) return null;

    const usersSnap = await db().ref("mk2_users").once("value");
    const tokens: string[] = [];
    const eligibleUids: { uid: string }[] = [];

    usersSnap.forEach((user) => {
      if (!user.key || user.key === poll.uid) return;
      const prefs = user.child("notificationPrefs").val() || {};
      if (prefs.community === false) return;
      const joinedRooms = user.child("joinedRooms").val() || {};
      if (!joinedRooms[roomId]) return;
      eligibleUids.push({ uid: user.key });
      const token = user.child("fcmToken").val() as string | null;
      if (token) tokens.push(token);
    });

    const title = `📊 New Poll in ${roomId}`;
    const body = poll.question || "A new poll has been posted. Go vote!";

    await writeNotificationForAll(eligibleUids, title, body, "community");
    await sendToTokens(tokens, title, body);
    return null;
  },
);

export const onNewsPostCreate = functions.database.onValueCreated(
  {
    ref: "/admin_news/{newsId}",
    instance: "gym-pro-20ee6-default-rtdb",
    region: "europe-west1",
  },
  async (event: any) => {
    const news = event.data.val() as {
      title?: string;
      content?: string;
      status?: string;
    };

    if (news?.status === "draft") {
      console.log(
        "onNewsPostCreate: skipping draft post — no notification sent",
      );
      return null;
    }

    await sendToAllUsers(
      news.title || "📢 News Update",
      news.content || "Read the latest news from MK Two Rivers.",
      "gymNews",
    );
    return null;
  },
);

export const checkinReminder = onSchedule(
  {
    schedule: "0 9 * * 1-6",
    timeZone: "Africa/Johannesburg",
    region: "europe-west1",
  },
  async () => {
    const now = new Date(
      new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
    );
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const bookingsSnap = await db().ref("class_bookings").once("value");
    if (!bookingsSnap.exists()) return;

    const bookedUids = new Set<string>();
    bookingsSnap.forEach((classNode) => {
      if (!classNode.key?.endsWith(todayKey)) return;
      classNode.forEach((userNode) => {
        if (userNode.key) bookedUids.add(userNode.key);
      });
    });

    if (bookedUids.size === 0) {
      console.log(
        `checkinReminder: no bookings found for ${todayKey}, skipping.`,
      );
      return;
    }

    const sends = [...bookedUids].map(async (uid) => {
      const prefs = await getUserPrefs(uid);
      if (prefs.classReminders === false) return;
      await sendToUser(
        uid,
        "Class Reminder 🏋️",
        "You have a class booked today — don't forget to check in at the gym!",
        "classes",
      );
    });

    await Promise.all(sends);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  PayFast ITN webhook — the single, consolidated webhook. Handles
//  class_booking, credits, membership + full subscription lifecycle
//  (COMPLETE / CANCELLED / FAILED), with dedup, IP whitelist, signature
//  check, and PayFast's server-to-server validate confirmation.
// ─────────────────────────────────────────────────────────────────────────────
export const payfastNotify = onRequest(
  { region: "europe-west1", secrets: PAYFAST_SECRETS },
  async (req: any, res: any) => {
    // ── CORS ─────────────────────────────────────────────────────────────
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }
    // Always ack fast — PayFast retries aggressively if it doesn't get a 200.
    // IMPORTANT: this is the ONLY res.send() call in this handler. Every
    // branch below uses a bare `return;` — do not add more res.send() calls,
    // since the response has already been sent to the client at this point.
    res.status(200).send("OK");

    const data = req.body as Record<string, string>;

    try {
      // ── 1. Dedup ───────────────────────────────────────────────────────
      const paymentId = data.pf_payment_id;
      if (paymentId) {
        const existing = await db().ref(`processedPayments/${paymentId}`).get();
        if (existing.exists()) {
          console.log("⚠️ Duplicate ITN ignored:", paymentId);
          return;
        }
        await db().ref(`processedPayments/${paymentId}`).set(true);
      }

      console.log("📩 ITN received:", JSON.stringify(data));

      // ── 2. IP whitelist ────────────────────────────────────────────────
      const callerIp = (
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress ||
        ""
      ).trim();
      if (!PAYFAST_IPS.includes(callerIp)) {
        console.error(`ITN blocked — bad IP: ${callerIp}`);
        return;
      }

      // ── 3. Local signature check ──────────────────────────────────────
      const received = { ...data };
      const theirSig = received.signature;
      delete received.signature;
      const ourSig = generateSignature(received, PAYFAST_PASSPHRASE.value());
      if (ourSig !== theirSig) {
        console.error("ITN blocked — signature mismatch");
        return;
      }

      // ── 4. Server-to-server confirm with PayFast ──────────────────────
      const paramString = Object.entries(data)
        .filter(([key]) => key !== "signature")
        .map(
          ([k, v]) =>
            `${k}=${encodeURIComponent(v ?? "").replace(/%20/g, "+")}`,
        )
        .join("&");

      const validRes = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: paramString,
      });
      const validText = await validRes.text();

      if (validText.trim() !== "VALID") {
        console.error("ITN blocked — PayFast validation failed:", validText);
        return;
      }

      const status = data.payment_status;
      const uid = data.custom_str1;
      const refId = data.custom_str2;
      const paymentType = data.custom_str4;
      const email = data.email_address;

      // ── CANCELLED — subscription ended, PayFast will not bill again ────
      if (status === "CANCELLED") {
        if (paymentType === "membership") {
          const found = await findUserRef(uid, email);
          if (!found) {
            console.error(
              `CANCELLED: user not found — uid=${uid}, email=${email}`,
            );
            return;
          }
          const { ref: userRef, key: userKey } = found;
          const userSnap = await userRef.get();
          const userData = userSnap.val() || {};
          const pendingDowngrade = userData.pendingDowngrade as
            | { tier: string; billing?: string }
            | null
            | undefined;

          // ── Scheduled downgrade → move to the lower tier instead of Basic ──
          if (pendingDowngrade && pendingDowngrade.tier) {
            const targetTier = pendingDowngrade.tier;
            const targetBilling = pendingDowngrade.billing || "monthly";
            const totalQuota = QUOTA[targetTier] ?? 0;

            await userRef.update({
              membership: targetTier,
              membershipBilling: targetBilling,
              membershipSince: Date.now(),
              membershipUpdatedAt: Date.now(),
              "subscription/pfToken": null,
              "subscription/status": "cancelled",
              aiQuota:
                totalQuota > 0
                  ? {
                      remaining: totalQuota,
                      total: totalQuota,
                      resetDate: nextMonthFirst(),
                    }
                  : null,
              cancelledAt: null,
              cancellationPending: false,
              cancellationRequestedAt: null,
              pendingDowngrade: null,
            });

            await db().ref(`paymentHistory/${userKey}`).push({
              event: "downgraded",
              tier: targetTier,
              date: Date.now(),
            });

            console.log(`⬇️ DOWNGRADED: ${userKey} → ${targetTier}`);

            await sendEmail(
              email,
              "Your Membership Has Changed - MK2 Fitness",
              `Hi,\n\nYour plan has now moved to ${targetTier.toUpperCase()} as requested.\n\nNote: since your previous subscription was cancelled, you'll need to visit the Membership page to reconfirm billing if you'd like this plan to continue renewing automatically.\n\n- MK2 Team`,
            );

            await sendToUser(
              userKey,
              "Plan Changed",
              `Your membership is now on the ${targetTier} plan.`,
              "profile",
            );
            return;
          }

          // ── Plain cancellation → Basic ──────────────────────────────────
          await userRef.update({
            membership: "basic",
            membershipBilling: null,
            "subscription/pfToken": null,
            "subscription/status": "cancelled",
            membershipUpdatedAt: Date.now(),
            cancelledAt: Date.now(),
            aiQuota: null,
            cancellationPending: false,
            cancellationRequestedAt: null,
            pendingDowngrade: null,
          });

          await db().ref(`paymentHistory/${userKey}`).push({
            event: "cancelled",
            date: Date.now(),
          });

          console.log(`⚠️ CANCELLED: ${userKey} → basic`);

          await sendEmail(
            email,
            "❌ Subscription Cancelled - MK2 Membership",
            `Hi,\n\nYour subscription has now ended and you have been moved to the Basic plan.\n\nWe're sorry to see you go — you're always welcome back!\n\n- MK2 Team`,
          );

          await sendToUser(
            userKey,
            "Subscription Ended",
            "Your membership has moved to the Basic plan.",
            "profile",
          );
        }
        return;
      }

      // ── FAILED — card declined, PayFast retries automatically ──────────
      if (status === "FAILED") {
        if (paymentType === "membership") {
          const found = await findUserRef(uid, email);
          if (!found) {
            console.error(
              `FAILED: user not found — uid=${uid}, email=${email}`,
            );
            return;
          }
          const { ref: userRef, key: userKey } = found;

          await userRef.update({ membershipFailedAt: Date.now() });

          await db()
            .ref(`paymentHistory/${userKey}`)
            .push({
              event: "failed",
              paymentId: data.pf_payment_id || null,
              date: Date.now(),
            });

          console.log(`❌ FAILED: ${userKey} — PayFast will retry`);

          await sendEmail(
            email,
            "⚠️ Payment Failed - MK2 Membership",
            `Hi,\n\nYour recent payment attempt failed.\n\nPayFast will retry automatically, but please ensure:\n- Your card has sufficient funds\n- Your payment method is valid\n\nIf the issue continues, your subscription may be cancelled.\n\n- MK2 Team`,
          );

          await sendToUser(
            userKey,
            "⚠️ Payment Failed",
            "Your recent membership payment failed. We'll retry automatically — please check your card details.",
            "profile",
          );
        }
        return;
      }

      // Only COMPLETE continues past this point.
      if (status !== "COMPLETE") {
        console.log(`ℹ️ ITN status ignored: ${status}`);
        return;
      }

      // ── CLASS BOOKING ────────────────────────────────────────────────────
      if (paymentType === "class_booking") {
        const bookingId = uid; // custom_str1 = the pending_bookings key
        const price = parseFloat(data.amount);

        const bookingRef = db().ref(`pending_bookings/${bookingId}`);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists()) {
          console.error(`Booking ${bookingId} not found in pending_bookings`);
          return;
        }

        const booking = bookingSnap.val();
        if (booking.status !== "pending_payment") {
          console.log(
            `Booking ${bookingId} already processed (${booking.status})`,
          );
          return;
        }

        await bookingRef.update({
          status: "confirmed",
          confirmedAt: Date.now(),
          payfastPfPaymentId: data.pf_payment_id,
        });

        const {
          userId,
          userEmail,
          userName,
          className,
          dateKey,
          dateDisplay,
          time,
          classId,
        } = booking;

        const safeKey = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, "_");
        const classBookingKey = `${safeKey(className)}_${dateKey}`;

        await db().ref(`class_bookings/${classBookingKey}/${userId}`).set({
          name: userName,
          email: userEmail,
          bookedAt: Date.now(),
          paid: true,
          amount: price,
          status: "confirmed",
        });

        let category = "Class";
        let trainer = "Coach";
        if (classId) {
          const clsSnap = await db().ref(`admin_classes/${classId}`).get();
          if (clsSnap.exists()) {
            const cls = clsSnap.val();
            category = cls.category || category;
            trainer = cls.trainer || trainer;
          }
          await db()
            .ref(`admin_classes/${classId}`)
            .transaction((current) => {
              if (current) current.bookedCount = (current.bookedCount || 0) + 1;
              return current;
            });
        }

        const newBooking = {
          name: className,
          time,
          dateKey,
          displayDate: dateDisplay,
          category,
          trainer,
          price,
        };

        const userBookingsRef = db().ref(`mk2_users/${userId}/bookings`);
        const userBookingsSnap = await userBookingsRef.get();
        const existingBookings: any[] = userBookingsSnap.val() || [];
        const alreadyListed = existingBookings.some(
          (b: any) => b.name === className && b.dateKey === dateKey,
        );
        if (!alreadyListed) {
          await userBookingsRef.set([...existingBookings, newBooking]);
        }

        await sendToUser(
          userId,
          "Class Booking Confirmed 🏋️",
          `Your payment for ${className} on ${dateDisplay} was successful. See you there!`,
          "classes",
        );

        console.log(
          `✓ Class booking confirmed: ${bookingId} for user ${userId}`,
        );
        return;
      }

      // ── CREDITS PURCHASE ─────────────────────────────────────────────────
      // FIXED: custom_str1 holds the pending_bookings purchase record ID, NOT
      // the user's UID (initiatePayFastForPack in Bookingengine.ts stores the
      // real userId inside that record, in custom_str3 for reference only).
      // The old version wrote credits to mk2_users/{purchaseId}/classCredits
      // — a path that never corresponds to a real user — so every credit
      // pack purchase silently did nothing. Now resolves the real user via
      // the pending_bookings record, same pattern as class_booking above.
      if (paymentType === "credits") {
        const purchaseId = uid; // custom_str1 = pending_bookings key
        if (!purchaseId) {
          console.error("Credits ITN missing purchase reference");
          return;
        }

        const purchaseRef = db().ref(`pending_bookings/${purchaseId}`);
        const purchaseSnap = await purchaseRef.get();
        if (!purchaseSnap.exists()) {
          console.error(`Credit purchase ${purchaseId} not found`);
          return;
        }
        const purchase = purchaseSnap.val();
        if (purchase.status !== "pending_payment") {
          console.log(
            `Purchase ${purchaseId} already processed (${purchase.status})`,
          );
          return;
        }

        const realUid = purchase.userId;
        const credits =
          purchase.creditsPurchased ?? parseInt(data.custom_int1 ?? "0", 10);

        const credRef = db().ref(`mk2_users/${realUid}/classCredits`);
        const snap = await credRef.once("value");
        const current = snap.exists() ? (snap.val() as number) : 0;
        await credRef.set(current + credits);

        await purchaseRef.update({
          status: "confirmed",
          confirmedAt: Date.now(),
          payfastPfPaymentId: data.pf_payment_id,
        });

        await db()
          .ref(`mk2_users/${realUid}/creditHistory`)
          .push({
            amount: credits,
            type: "payfast_purchase",
            note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
            timestamp: Date.now(),
          });

        await sendToUser(
          realUid,
          "Credits Added! 🎟",
          `${credits} class credits have been added to your account.`,
          "classes",
        );
        console.log(`✓ Added ${credits} credits to ${realUid}`);
        return;
      }

      // ── MEMBERSHIP (first payment OR a recurring renewal) ────────────────
      if (paymentType === "membership") {
        if (!uid) {
          console.error("Membership ITN missing uid");
          return;
        }

        // PayFast sends the recurring billing token as `token` on subscription ITNs
        const pfToken = data.token;
        const intentId = data.custom_str3;

        // FIXED: recover billingCycle from the pending_subscriptions record
        // payfastSign created. Without this, subscription/billingCycle is
        // never set, and scheduleDowngrade always assumes "monthly" —
        // meaning an annual subscriber who downgrades gets the wrong
        // billing cycle recorded on their new plan.
        let billingCycle: "monthly" | "annual" = "monthly";
        if (intentId) {
          const intentSnap = await db()
            .ref(`pending_subscriptions/${intentId}`)
            .get();
          if (intentSnap.exists()) {
            billingCycle =
              intentSnap.val().billingCycle === "annual" ? "annual" : "monthly";
          }
        }

        await db().ref(`mk2_users/${uid}/membership`).set(refId);
        await db()
          .ref(`mk2_users/${uid}/subscription`)
          .update({
            tier: refId,
            pfToken: pfToken ?? null,
            billingCycle,
            status: "active",
            lastPaymentId: data.pf_payment_id,
            updatedAt: Date.now(),
          });

        if (intentId) {
          await db().ref(`pending_subscriptions/${intentId}`).update({
            status: "confirmed",
            confirmedAt: Date.now(),
          });
        }

        await db()
          .ref(`mk2_users/${uid}/membershipHistory`)
          .push({
            tier: refId,
            type: "payfast_upgrade",
            note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
            timestamp: Date.now(),
          });

        await sendToUser(
          uid,
          "Membership Upgraded! 🏆",
          `Welcome to ${refId.charAt(0).toUpperCase() + refId.slice(1)} membership!`,
          "profile",
        );
        console.log(`✓ Upgraded ${uid} to ${refId}`);
        return;
      }

      console.warn("Unknown payment type:", paymentType);
    } catch (err) {
      console.error("ITN processing error:", err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
//  Log Personal Record (callable function) — unchanged from your live file
// ─────────────────────────────────────────────────────────────────────────────
export const logPR = onCall({ region: "europe-west1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid)
    throw new functions.https.HttpsError("unauthenticated", "Not logged in");

  const data = request.data;
  const required = [
    "exercise_id",
    "value",
    "displayValue",
    "category",
    "level",
  ];
  for (const field of required) {
    if (!data[field]) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Missing ${field}`,
      );
    }
  }

  const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
  const user = userSnap.val();
  if (!user)
    throw new functions.https.HttpsError("not-found", "User not found");

  const prData = {
    uid,
    athlete: user.name || "Unknown",
    gender: user.gender === "female" ? "Female" : "Male",
    level: data.level,
    category: data.category,
    exercise_id: data.exercise_id,
    exercise: data.exercise,
    value: data.value,
    unit: data.unit,
    displayValue: data.displayValue,
    notes: data.notes || "",
    date_logged: data.date_logged,
    timestamp: Date.now(),
  };

  const newRef = await db().ref("pr_logbook").push(prData);
  return { success: true, key: newRef.key };
});

// ─────────────────────────────────────────────────────────────────────────────
//  Push notification callables — unchanged from your live file
// ─────────────────────────────────────────────────────────────────────────────
export const sendPushNotification = onCall(
  { region: "europe-west1" },
  async (request) => {
    const { token, title, body, type } = request.data as {
      token: string;
      title: string;
      body: string;
      type?: string;
    };

    if (!token || !title || !body) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "token, title and body are required",
      );
    }

    const message: admin.messaging.Message = {
      token,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        },
        fcmOptions: { link: "/" },
      },
      data: { type: type ?? "general" },
    };

    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  },
);

export const sendPushBroadcast = onCall(
  { region: "europe-west1" },
  async (request) => {
    const { tokens, title, body, type } = request.data as {
      tokens: string[];
      title: string;
      body: string;
      type?: string;
    };

    if (!tokens?.length || !title || !body) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "tokens[], title and body are required",
      );
    }

    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    let successCount = 0;
    let failureCount = 0;
    const cleanupPromises: Promise<any>[] = [];

    for (const chunk of chunks) {
      const multicast: admin.messaging.MulticastMessage = {
        tokens: chunk,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
          },
          fcmOptions: { link: "/" },
        },
        data: { type: type ?? "general" },
      };

      const response = await admin.messaging().sendEachForMulticast(multicast);
      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          (resp.error?.code === "messaging/invalid-registration-token" ||
            resp.error?.code === "messaging/registration-token-not-registered")
        ) {
          const badToken = chunk[idx];
          cleanupPromises.push(
            db()
              .ref("mk2_users")
              .once("value")
              .then((snap) =>
                snap.forEach((user) => {
                  if (user.child("fcmToken").val() === badToken) {
                    user.ref.child("fcmToken").remove();
                  }
                }),
              ),
          );
        }
      });
    }

    await Promise.all(cleanupPromises);
    return { success: true, successCount, failureCount };
  },
);

// import * as functions from "firebase-functions/v2";
// import { onRequest, onCall } from "firebase-functions/v2/https";
// import { onSchedule } from "firebase-functions/v2/scheduler";
// // import { defineSecret, defineString } from "firebase-functions/params";
// import { defineSecret } from "firebase-functions/params";
// import * as admin from "firebase-admin";
// import * as crypto from "crypto";

// // ── Exports for modularised functions ──────────────────────────────────────
// export { payfastSign } from "./payfastSign";
// export {
//   cancelSubscription,
//   scheduleDowngrade,
// } from "./subscriptionManagement";
// export { payfastWebhook, releaseStalePendingBookings } from "./payfastWebhook";

// // import * as nodemailer from "nodemailer"; // re-enable once email is set up

// admin.initializeApp();

// function db() {
//   return admin.database();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Secrets & config — nothing sensitive lives in code or a .env file.
// //  Set these once with:
// //    firebase functions:secrets:set PAYFAST_MERCHANT_ID
// //    firebase functions:secrets:set PAYFAST_MERCHANT_KEY
// //    firebase functions:secrets:set PAYFAST_PASSPHRASE
// //    firebase functions:secrets:set EMAIL_USER
// //    firebase functions:secrets:set EMAIL_PASS
// //  (OPENAI_API_KEY is a separate secret already used by aiChat below.)
// // ─────────────────────────────────────────────────────────────────────────────
// const PAYFAST_MERCHANT_ID = defineSecret("PAYFAST_MERCHANT_ID");
// const PAYFAST_MERCHANT_KEY = defineSecret("PAYFAST_MERCHANT_KEY");
// const PAYFAST_PASSPHRASE = defineSecret("PAYFAST_PASSPHRASE");
// // ── Email disabled for now — waiting on Gmail 2FA / app password setup ──────
// // Uncomment these two lines once EMAIL_USER and EMAIL_PASS secrets are set:
// // const EMAIL_USER = defineSecret("EMAIL_USER");
// // const EMAIL_PASS = defineSecret("EMAIL_PASS");

// // const FRONTEND_URL = defineString("FRONTEND_URL", {
// //   default: "https://webapp.mktworiversfitness.co.za/",
// // });

// const PAYFAST_HOST = "https://www.payfast.co.za";

// const PAYFAST_IPS = [
//   "197.97.145.144",
//   "197.97.145.145",
//   "197.97.145.146",
//   "197.97.145.147",
//   "41.74.179.194",
//   "41.74.179.195",
//   "41.74.179.196",
//   "41.74.179.197",
// ];

// const PAYFAST_SECRETS = [
//   PAYFAST_MERCHANT_ID,
//   PAYFAST_MERCHANT_KEY,
//   PAYFAST_PASSPHRASE,
//   // EMAIL_USER, EMAIL_PASS — re-add once email is set up
// ];

// // ─────────────────────────────────────────────────────────────────────────────
// //  Email helper — transporter built lazily so secret values are read at
// //  request time, not at module load time.
// // ─────────────────────────────────────────────────────────────────────────────
// async function sendEmail(to: string, subject: string, text: string) {
//   // ── EMAIL DISABLED ──────────────────────────────────────────────────────
//   console.log(`📧 [email disabled] Would have sent "${subject}" to ${to}`);
//   return;

//   /*
//   if (!to) return;
//   try {
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: EMAIL_USER.value(),
//         pass: EMAIL_PASS.value(),
//       },
//     });
//     await transporter.sendMail({
//       from: `"MK2 Fitness" <${EMAIL_USER.value()}>`,
//       to,
//       subject,
//       text,
//     });
//     console.log("📧 Email sent to:", to);
//   } catch (err: any) {
//     console.error("Email error:", err.message);
//   }
//   */
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  AI Chat (OpenAI) — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
// const OPENAI_MODEL = "gpt-4o-mini";

// const QUOTA: Record<string, number> = {
//   unlimited_12m: 100,
//   unlimited_6m: 100,
//   unlimited_m2m: 100,
//   hybrid_12m: 20,
//   hybrid_6m: 20,
//   hybrid_m2m: 20,
//   u18: 20,
//   gold: 100,
//   silver: 20,
//   basic: 0,
// };

// function nextMonthFirst(): number {
//   const d = new Date();
//   d.setMonth(d.getMonth() + 1);
//   d.setDate(1);
//   d.setHours(0, 0, 0, 0);
//   return d.getTime();
// }

// async function checkAndIncrementQuota(uid: string): Promise<number> {
//   const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//   const user = userSnap.val();
//   if (!user)
//     throw new functions.https.HttpsError("not-found", "User not found");

//   const membership = user.membership ?? "basic";

//   if (membership === "basic") {
//     throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
//   }

//   const total = QUOTA[membership] ?? 0;
//   if (total === 0) {
//     throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
//   }

//   const quotaRef = db().ref(`mk2_users/${uid}/aiQuota`);
//   const quotaSnap = await quotaRef.once("value");
//   let quota = quotaSnap.val() as {
//     remaining: number;
//     total: number;
//     resetDate: number;
//   } | null;

//   const now = Date.now();
//   if (!quota || !quota.resetDate || now >= quota.resetDate) {
//     quota = { remaining: total, total, resetDate: nextMonthFirst() };
//   }

//   if (quota.remaining <= 0) {
//     throw new functions.https.HttpsError(
//       "resource-exhausted",
//       "QUOTA_EXCEEDED",
//     );
//   }

//   const newRemaining = quota.remaining - 1;
//   await quotaRef.set({
//     remaining: newRemaining,
//     total: quota.total,
//     resetDate: quota.resetDate,
//   });

//   return newRemaining;
// }

// async function callOpenAI(
//   apiKey: string,
//   systemPrompt: string,
//   messages: any[],
// ): Promise<string> {
//   const response = await fetch(OPENAI_API_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${apiKey}`,
//     },
//     body: JSON.stringify({
//       model: OPENAI_MODEL,
//       max_tokens: 1500,
//       messages: [{ role: "system", content: systemPrompt }, ...messages],
//     }),
//   });

//   if (!response.ok) {
//     const err = await response.text();
//     console.error("OpenAI API error:", response.status, err);
//     throw new functions.https.HttpsError(
//       "internal",
//       `OpenAI API error: ${response.status}`,
//     );
//   }

//   const data = await response.json();
//   const text = data.choices?.[0]?.message?.content ?? "";

//   if (!text) {
//     throw new functions.https.HttpsError("internal", "EMPTY_RESPONSE");
//   }

//   return text;
// }

// export const aiChat = onCall(
//   {
//     region: "europe-west1",
//     secrets: ["OPENAI_API_KEY"],
//     timeoutSeconds: 120,
//     memory: "512MiB",
//   },
//   async (request) => {
//     const uid = request.auth?.uid;
//     if (!uid) {
//       throw new functions.https.HttpsError("unauthenticated", "Not logged in");
//     }

//     const { mode, prompt, systemPrompt, fileData, mediaType, isPDF } =
//       request.data as {
//         mode: string;
//         prompt?: string;
//         systemPrompt?: string;
//         fileData?: string;
//         mediaType?: string;
//         isPDF?: boolean;
//       };

//     const quotaRemaining = await checkAndIncrementQuota(uid);

//     const apiKey = process.env.OPENAI_API_KEY;
//     if (!apiKey) {
//       throw new functions.https.HttpsError(
//         "internal",
//         "API key not configured",
//       );
//     }

//     const sysPrompt =
//       systemPrompt ||
//       "You are a helpful fitness assistant at MK2 Rivers Fitness, South Africa.";

//     if (mode === "inbody_extract") {
//       if (!fileData || !mediaType) {
//         throw new functions.https.HttpsError(
//           "invalid-argument",
//           "fileData and mediaType are required for inbody_extract mode",
//         );
//       }

//       if (isPDF) {
//         throw new functions.https.HttpsError(
//           "invalid-argument",
//           "PDF extraction is not supported with the current AI provider — please upload an image instead.",
//         );
//       }

//       const messages = [
//         {
//           role: "user",
//           content: [
//             {
//               type: "text",
//               text:
//                 prompt ||
//                 `Extract InBody values as JSON with keys: weight, bodyFat, muscleMass, fatMass, visceralFat, totalBodyWater. Respond ONLY with the JSON object.`,
//             },
//             {
//               type: "image_url",
//               image_url: { url: `data:${mediaType};base64,${fileData}` },
//             },
//           ],
//         },
//       ];

//       const response = await callOpenAI(apiKey, sysPrompt, messages);
//       return { response, quotaRemaining };
//     }

//     if (!prompt) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "prompt is required for this mode",
//       );
//     }

//     const messages = [{ role: "user", content: prompt }];
//     const response = await callOpenAI(apiKey, sysPrompt, messages);
//     return { response, quotaRemaining };
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  Notification helpers — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────

// async function writeNotification(
//   uid: string,
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   await db()
//     .ref(`users/${uid}/notifications`)
//     .push({
//       title,
//       body,
//       message: body,
//       timestamp: Date.now(),
//       read: false,
//       createdAt: Date.now(),
//       ...(link ? { link } : {}),
//     });
// }

// async function writeNotificationForAll(
//   uidTokenPairs: { uid: string }[],
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   const writes = uidTokenPairs.map(({ uid }) =>
//     writeNotification(uid, title, body, link),
//   );
//   await Promise.all(writes);
// }

// async function getUserToken(uid: string): Promise<string | null> {
//   const snap = await db().ref(`mk2_users/${uid}/fcmToken`).once("value");
//   return snap.val() as string | null;
// }

// async function getUserPrefs(uid: string): Promise<Record<string, boolean>> {
//   const snap = await db()
//     .ref(`mk2_users/${uid}/notificationPrefs`)
//     .once("value");
//   return snap.val() || {};
// }

// async function sendToTokens(tokens: string[], title: string, body: string) {
//   if (tokens.length === 0) return;

//   const unique = [...new Set(tokens.filter(Boolean))];
//   if (unique.length === 0) return;

//   const message: admin.messaging.MulticastMessage = {
//     notification: { title, body },
//     tokens: unique,
//   };

//   const response = await admin.messaging().sendEachForMulticast(message);

//   const cleanupPromises: Promise<any>[] = [];
//   response.responses.forEach((resp, idx) => {
//     if (
//       !resp.success &&
//       (resp.error?.code === "messaging/invalid-registration-token" ||
//         resp.error?.code === "messaging/registration-token-not-registered")
//     ) {
//       const badToken = unique[idx];
//       cleanupPromises.push(
//         db()
//           .ref("mk2_users")
//           .once("value")
//           .then((snap) =>
//             snap.forEach((user) => {
//               if (user.child("fcmToken").val() === badToken) {
//                 user.ref.child("fcmToken").remove();
//               }
//             }),
//           ),
//       );
//     }
//   });

//   await Promise.all(cleanupPromises);
// }

// async function sendToUser(
//   uid: string,
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   const token = await getUserToken(uid);
//   await writeNotification(uid, title, body, link);
//   if (token) await sendToTokens([token], title, body);
//   console.log(`Notification sent + written for ${uid}`);
// }

// async function sendToAllUsers(
//   title: string,
//   body: string,
//   prefKey?: string,
//   link?: string,
// ) {
//   const usersSnap = await db().ref("mk2_users").once("value");
//   const tokens: string[] = [];
//   const eligibleUids: { uid: string }[] = [];

//   usersSnap.forEach((user) => {
//     if (!user.key) return;
//     if (prefKey) {
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs[prefKey] === false) return;
//     }
//     eligibleUids.push({ uid: user.key });
//     const token = user.child("fcmToken").val() as string | null;
//     if (token) tokens.push(token);
//   });

//   await writeNotificationForAll(eligibleUids, title, body, link);
//   await sendToTokens(tokens, title, body);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  PayFast ITN-verification signature helper.
// //  NOTE: this verifies INCOMING PayFast notifications. It is intentionally
// //  separate from the OUTBOUND request-signing logic in payfastApiClient.ts,
// //  which builds signatures for calls we make TO PayFast's Subscriptions API.
// //  Do not merge these — they sign different things for different purposes.
// // ─────────────────────────────────────────────────────────────────────────────
// function generateSignature(
//   data: Record<string, string>,
//   passphrase = "",
// ): string {
//   const pfData = { ...data };

//   if (passphrase && passphrase.trim() !== "") {
//     (pfData as any).passphrase = passphrase.trim();
//   }

//   const str = Object.keys(pfData)
//     .sort()
//     .map(
//       (k) =>
//         `${k}=${encodeURIComponent(String(pfData[k])).replace(/%20/g, "+")}`,
//     )
//     .join("&");

//   return crypto.createHash("md5").update(str).digest("hex");
// }

// // Fallback lookup by email if custom_str1 (uid) doesn't resolve to a user
// async function findUserRef(
//   userId: string | undefined,
//   email: string | undefined,
// ): Promise<{ ref: admin.database.Reference; key: string } | null> {
//   if (userId) {
//     const snap = await db().ref(`mk2_users/${userId}`).get();
//     if (snap.exists())
//       return { ref: db().ref(`mk2_users/${userId}`), key: userId };
//   }
//   if (email) {
//     const snap = await db()
//       .ref("mk2_users")
//       .orderByChild("email")
//       .equalTo(email)
//       .limitToFirst(1)
//       .get();
//     if (snap.exists()) {
//       const key = Object.keys(snap.val())[0];
//       return { ref: db().ref(`mk2_users/${key}`), key };
//     }
//   }
//   return null;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Existing triggers — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────

// export const onClassBookingCreate = functions.database.onValueCreated(
//   {
//     ref: "/class_bookings/{classDay}/{userId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const userId = event.params.userId;
//     const classDay = event.params.classDay;
//     const bookingData = event.data.val();

//     if (bookingData?.paid === true) {
//       console.log(
//         `onClassBookingCreate: skipping paid booking for ${userId} — payfastNotify handles notification`,
//       );
//       return null;
//     }

//     const prefs = await getUserPrefs(userId);
//     if (prefs.classReminders === false) return null;

//     await sendToUser(
//       userId,
//       "Class Booking Confirmed 🏋️",
//       `You are booked for the class on ${classDay}. See you there!`,
//       "classes",
//     );
//     return null;
//   },
// );

// export const onMessageCreate = functions.database.onValueCreated(
//   {
//     ref: "/rooms/{roomId}/messages/{messageId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const roomId = event.params.roomId;
//     const message = event.data.val() as {
//       uid: string;
//       user?: string;
//       text?: string;
//     };
//     if (!message) return null;

//     const usersSnap = await db().ref("mk2_users").once("value");
//     const tokens: string[] = [];
//     const eligibleUids: { uid: string }[] = [];

//     usersSnap.forEach((user) => {
//       if (!user.key || user.key === message.uid) return;
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs.community === false) return;
//       const joinedRooms = user.child("joinedRooms").val() || {};
//       if (!joinedRooms[roomId]) return;
//       eligibleUids.push({ uid: user.key });
//       const token = user.child("fcmToken").val() as string | null;
//       if (token) tokens.push(token);
//     });

//     const title = `💬 New message in ${roomId}`;
//     const body = message.text
//       ? `${message.user || "Someone"}: ${message.text.slice(0, 100)}`
//       : `${message.user || "Someone"} sent a file`;

//     await writeNotificationForAll(eligibleUids, title, body, "community");
//     await sendToTokens(tokens, title, body);
//     return null;
//   },
// );

// export const onPollCreate = functions.database.onValueCreated(
//   {
//     ref: "/rooms/{roomId}/polls/{pollId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const poll = event.data.val() as { uid: string; question?: string };
//     const roomId = event.params.roomId;
//     if (!poll) return null;

//     const usersSnap = await db().ref("mk2_users").once("value");
//     const tokens: string[] = [];
//     const eligibleUids: { uid: string }[] = [];

//     usersSnap.forEach((user) => {
//       if (!user.key || user.key === poll.uid) return;
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs.community === false) return;
//       const joinedRooms = user.child("joinedRooms").val() || {};
//       if (!joinedRooms[roomId]) return;
//       eligibleUids.push({ uid: user.key });
//       const token = user.child("fcmToken").val() as string | null;
//       if (token) tokens.push(token);
//     });

//     const title = `📊 New Poll in ${roomId}`;
//     const body = poll.question || "A new poll has been posted. Go vote!";

//     await writeNotificationForAll(eligibleUids, title, body, "community");
//     await sendToTokens(tokens, title, body);
//     return null;
//   },
// );

// export const onNewsPostCreate = functions.database.onValueCreated(
//   {
//     ref: "/admin_news/{newsId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const news = event.data.val() as {
//       title?: string;
//       content?: string;
//       status?: string;
//     };

//     if (news?.status === "draft") {
//       console.log(
//         "onNewsPostCreate: skipping draft post — no notification sent",
//       );
//       return null;
//     }

//     await sendToAllUsers(
//       news.title || "📢 News Update",
//       news.content || "Read the latest news from MK Two Rivers.",
//       "gymNews",
//     );
//     return null;
//   },
// );

// export const checkinReminder = onSchedule(
//   {
//     schedule: "0 9 * * 1-6",
//     timeZone: "Africa/Johannesburg",
//     region: "europe-west1",
//   },
//   async () => {
//     const now = new Date(
//       new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
//     );
//     const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

//     const bookingsSnap = await db().ref("class_bookings").once("value");
//     if (!bookingsSnap.exists()) return;

//     const bookedUids = new Set<string>();
//     bookingsSnap.forEach((classNode) => {
//       if (!classNode.key?.endsWith(todayKey)) return;
//       classNode.forEach((userNode) => {
//         if (userNode.key) bookedUids.add(userNode.key);
//       });
//     });

//     if (bookedUids.size === 0) {
//       console.log(
//         `checkinReminder: no bookings found for ${todayKey}, skipping.`,
//       );
//       return;
//     }

//     const sends = [...bookedUids].map(async (uid) => {
//       const prefs = await getUserPrefs(uid);
//       if (prefs.classReminders === false) return;
//       await sendToUser(
//         uid,
//         "Class Reminder 🏋️",
//         "You have a class booked today — don't forget to check in at the gym!",
//         "classes",
//       );
//     });

//     await Promise.all(sends);
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  PayFast ITN webhook — handles class_booking, credits, membership + full
// //  subscription lifecycle (COMPLETE / CANCELLED / FAILED), with dedup, IP
// //  whitelist, signature check, and PayFast's server-to-server validate.
// //
// //  ⚠️ ARCHITECTURE NOTE (unresolved — see chat): this project currently has
// //  TWO webhook functions — this one (payfastNotify) and payfastWebhook.ts.
// //  Bookingengine.ts's class-booking and credit-pack flows point their
// //  notify_url at payfastWebhook, NOT this function. That means the
// //  class_booking and credits branches below only run if something points
// //  notify_url here instead. Do not assume both are live until you've
// //  confirmed which notify_url each flow actually uses.
// // ─────────────────────────────────────────────────────────────────────────────
// export const payfastNotify = onRequest(
//   { region: "europe-west1", secrets: PAYFAST_SECRETS },
//   async (req: any, res: any) => {
//     // ── CORS ─────────────────────────────────────────────────────────────
//     res.set("Access-Control-Allow-Origin", "*");
//     res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
//     res.set("Access-Control-Allow-Headers", "Content-Type");

//     if (req.method === "OPTIONS") {
//       res.status(204).send("");
//       return;
//     }

//     if (req.method !== "POST") {
//       res.status(405).send("Method not allowed");
//       return;
//     }
//     // Always ack fast — PayFast retries aggressively if it doesn't get a 200.
//     // IMPORTANT: this is the ONLY res.send() call in this handler. Every
//     // branch below uses a bare `return;` — do not add more res.send() calls,
//     // since the response has already been sent to the client at this point.
//     res.status(200).send("OK");

//     const data = req.body as Record<string, string>;

//     try {
//       // ── 1. Dedup ───────────────────────────────────────────────────────
//       const paymentId = data.pf_payment_id;
//       if (paymentId) {
//         const existing = await db().ref(`processedPayments/${paymentId}`).get();
//         if (existing.exists()) {
//           console.log("⚠️ Duplicate ITN ignored:", paymentId);
//           return;
//         }
//         await db().ref(`processedPayments/${paymentId}`).set(true);
//       }

//       console.log("📩 ITN received:", JSON.stringify(data));

//       // ── 2. IP whitelist ────────────────────────────────────────────────
//       const callerIp = (
//         req.headers["x-forwarded-for"]?.split(",")[0] ||
//         req.socket.remoteAddress ||
//         ""
//       ).trim();
//       if (!PAYFAST_IPS.includes(callerIp)) {
//         console.error(`ITN blocked — bad IP: ${callerIp}`);
//         return;
//       }

//       // ── 3. Local signature check ──────────────────────────────────────
//       const received = { ...data };
//       const theirSig = received.signature;
//       delete received.signature;
//       const ourSig = generateSignature(received, PAYFAST_PASSPHRASE.value());
//       if (ourSig !== theirSig) {
//         console.error("ITN blocked — signature mismatch");
//         return;
//       }

//       // ── 4. Server-to-server confirm with PayFast ──────────────────────
//       const paramString = Object.entries(data)
//         .filter(([key]) => key !== "signature")
//         .map(
//           ([k, v]) =>
//             `${k}=${encodeURIComponent(v ?? "").replace(/%20/g, "+")}`,
//         )
//         .join("&");

//       const validRes = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
//         method: "POST",
//         headers: { "Content-Type": "application/x-www-form-urlencoded" },
//         body: paramString,
//       });
//       const validText = await validRes.text();

//       if (validText.trim() !== "VALID") {
//         console.error("ITN blocked — PayFast validation failed:", validText);
//         return;
//       }

//       const status = data.payment_status;
//       const uid = data.custom_str1;
//       const refId = data.custom_str2;
//       const paymentType = data.custom_str4;
//       const email = data.email_address;

//       // ── CANCELLED — subscription ended, PayFast will not bill again ────
//       if (status === "CANCELLED") {
//         if (paymentType === "membership") {
//           const found = await findUserRef(uid, email);
//           if (!found) {
//             console.error(
//               `CANCELLED: user not found — uid=${uid}, email=${email}`,
//             );
//             return;
//           }
//           const { ref: userRef, key: userKey } = found;
//           const userSnap = await userRef.get();
//           const userData = userSnap.val() || {};
//           const pendingDowngrade = userData.pendingDowngrade as
//             | { tier: string; billing?: string }
//             | null
//             | undefined;

//           // ── Scheduled downgrade → move to the lower tier instead of Basic ──
//           if (pendingDowngrade && pendingDowngrade.tier) {
//             const targetTier = pendingDowngrade.tier;
//             const targetBilling = pendingDowngrade.billing || "monthly";
//             const totalQuota = QUOTA[targetTier] ?? 0;

//             await userRef.update({
//               membership: targetTier,
//               membershipBilling: targetBilling,
//               membershipSince: Date.now(),
//               membershipUpdatedAt: Date.now(),
//               "subscription/pfToken": null,
//               "subscription/status": "cancelled",
//               aiQuota:
//                 totalQuota > 0
//                   ? {
//                       remaining: totalQuota,
//                       total: totalQuota,
//                       resetDate: nextMonthFirst(),
//                     }
//                   : null,
//               cancelledAt: null,
//               cancellationPending: false,
//               cancellationRequestedAt: null,
//               pendingDowngrade: null,
//             });

//             await db().ref(`paymentHistory/${userKey}`).push({
//               event: "downgraded",
//               tier: targetTier,
//               date: Date.now(),
//             });

//             console.log(`⬇️ DOWNGRADED: ${userKey} → ${targetTier}`);

//             await sendEmail(
//               email,
//               "Your Membership Has Changed - MK2 Fitness",
//               `Hi,\n\nYour plan has now moved to ${targetTier.toUpperCase()} as requested.\n\nNote: since your previous subscription was cancelled, you'll need to visit the Membership page to reconfirm billing if you'd like this plan to continue renewing automatically.\n\n- MK2 Team`,
//             );

//             await sendToUser(
//               userKey,
//               "Plan Changed",
//               `Your membership is now on the ${targetTier} plan.`,
//               "profile",
//             );
//             return;
//           }

//           // ── Plain cancellation → Basic ──────────────────────────────────
//           await userRef.update({
//             membership: "basic",
//             membershipBilling: null,
//             "subscription/pfToken": null,
//             "subscription/status": "cancelled",
//             membershipUpdatedAt: Date.now(),
//             cancelledAt: Date.now(),
//             aiQuota: null,
//             cancellationPending: false,
//             cancellationRequestedAt: null,
//             pendingDowngrade: null,
//           });

//           await db().ref(`paymentHistory/${userKey}`).push({
//             event: "cancelled",
//             date: Date.now(),
//           });

//           console.log(`⚠️ CANCELLED: ${userKey} → basic`);

//           await sendEmail(
//             email,
//             "❌ Subscription Cancelled - MK2 Membership",
//             `Hi,\n\nYour subscription has now ended and you have been moved to the Basic plan.\n\nWe're sorry to see you go — you're always welcome back!\n\n- MK2 Team`,
//           );

//           await sendToUser(
//             userKey,
//             "Subscription Ended",
//             "Your membership has moved to the Basic plan.",
//             "profile",
//           );
//         }
//         return;
//       }

//       // ── FAILED — card declined, PayFast retries automatically ──────────
//       if (status === "FAILED") {
//         if (paymentType === "membership") {
//           const found = await findUserRef(uid, email);
//           if (!found) {
//             console.error(
//               `FAILED: user not found — uid=${uid}, email=${email}`,
//             );
//             return;
//           }
//           const { ref: userRef, key: userKey } = found;

//           await userRef.update({ membershipFailedAt: Date.now() });

//           await db()
//             .ref(`paymentHistory/${userKey}`)
//             .push({
//               event: "failed",
//               paymentId: data.pf_payment_id || null,
//               date: Date.now(),
//             });

//           console.log(`❌ FAILED: ${userKey} — PayFast will retry`);

//           await sendEmail(
//             email,
//             "⚠️ Payment Failed - MK2 Membership",
//             `Hi,\n\nYour recent payment attempt failed.\n\nPayFast will retry automatically, but please ensure:\n- Your card has sufficient funds\n- Your payment method is valid\n\nIf the issue continues, your subscription may be cancelled.\n\n- MK2 Team`,
//           );

//           await sendToUser(
//             userKey,
//             "⚠️ Payment Failed",
//             "Your recent membership payment failed. We'll retry automatically — please check your card details.",
//             "profile",
//           );
//         }
//         return;
//       }

//       // Only COMPLETE continues past this point.
//       if (status !== "COMPLETE") {
//         console.log(`ℹ️ ITN status ignored: ${status}`);
//         return;
//       }

//       // ── CLASS BOOKING ────────────────────────────────────────────────────
//       // FIXED: reads from pending_bookings (what Bookingengine.ts actually
//       // writes), not the old mk2_bookings path, and only destructures fields
//       // that actually exist on a PendingBooking record. category/trainer
//       // are looked up from admin_classes via classId instead of assumed.
//       if (paymentType === "class_booking") {
//         const bookingId = uid; // custom_str1 = the pending_bookings key
//         const price = parseFloat(data.amount);

//         const bookingRef = db().ref(`pending_bookings/${bookingId}`);
//         const bookingSnap = await bookingRef.get();
//         if (!bookingSnap.exists()) {
//           console.error(`Booking ${bookingId} not found in pending_bookings`);
//           return;
//         }

//         const booking = bookingSnap.val();
//         if (booking.status !== "pending_payment") {
//           console.log(
//             `Booking ${bookingId} already processed (${booking.status})`,
//           );
//           return;
//         }

//         await bookingRef.update({
//           status: "confirmed",
//           confirmedAt: Date.now(),
//           payfastPfPaymentId: data.pf_payment_id,
//         });

//         const {
//           userId,
//           userEmail,
//           userName,
//           className,
//           dateKey,
//           dateDisplay,
//           time,
//           classId,
//         } = booking;

//         const safeKey = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, "_");
//         const classBookingKey = `${safeKey(className)}_${dateKey}`;

//         await db().ref(`class_bookings/${classBookingKey}/${userId}`).set({
//           name: userName,
//           email: userEmail,
//           bookedAt: Date.now(),
//           paid: true,
//           amount: price,
//           status: "confirmed",
//         });

//         let category = "Class";
//         let trainer = "Coach";
//         if (classId) {
//           const clsSnap = await db().ref(`admin_classes/${classId}`).get();
//           if (clsSnap.exists()) {
//             const cls = clsSnap.val();
//             category = cls.category || category;
//             trainer = cls.trainer || trainer;
//           }
//           await db()
//             .ref(`admin_classes/${classId}`)
//             .transaction((current) => {
//               if (current) current.bookedCount = (current.bookedCount || 0) + 1;
//               return current;
//             });
//         }

//         const newBooking = {
//           name: className,
//           time,
//           dateKey,
//           displayDate: dateDisplay,
//           category,
//           trainer,
//           price,
//         };

//         const userBookingsRef = db().ref(`mk2_users/${userId}/bookings`);
//         const userBookingsSnap = await userBookingsRef.get();
//         const existingBookings: any[] = userBookingsSnap.val() || [];
//         const alreadyListed = existingBookings.some(
//           (b: any) => b.name === className && b.dateKey === dateKey,
//         );
//         if (!alreadyListed) {
//           await userBookingsRef.set([...existingBookings, newBooking]);
//         }

//         await sendToUser(
//           userId,
//           "Class Booking Confirmed 🏋️",
//           `Your payment for ${className} on ${dateDisplay} was successful. See you there!`,
//           "classes",
//         );

//         console.log(
//           `✓ Class booking confirmed: ${bookingId} for user ${userId}`,
//         );
//         return;
//       }

//       // ── CREDITS PURCHASE ─────────────────────────────────────────────────
//       // ⚠️ NOT YET VERIFIED against Bookingengine.ts's initiatePayFastForPack,
//       // which sends credits via custom_int1 and points notify_url at
//       // payfastWebhook, not here. If you route credit-pack purchases to this
//       // function instead, change `data.custom_str3` below to `data.custom_int1`.
//       if (paymentType === "credits") {
//         if (!uid) {
//           console.error("Credits ITN missing uid");
//           return;
//         }
//         const credits = parseInt(data.custom_int1 ?? "0", 10);
//         const credRef = db().ref(`mk2_users/${uid}/classCredits`);
//         const snap = await credRef.once("value");
//         const current = snap.exists() ? (snap.val() as number) : 0;
//         await credRef.set(current + credits);

//         await db()
//           .ref(`mk2_users/${uid}/creditHistory`)
//           .push({
//             amount: credits,
//             type: "payfast_purchase",
//             note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
//             timestamp: Date.now(),
//           });

//         await sendToUser(
//           uid,
//           "Credits Added! 🎟",
//           `${credits} class credits have been added to your account.`,
//           "classes",
//         );
//         console.log(`✓ Added ${credits} credits to ${uid}`);
//         return;
//       }

//       // ── MEMBERSHIP (first payment OR a recurring renewal) ────────────────
//       if (paymentType === "membership") {
//         if (!uid) {
//           console.error("Membership ITN missing uid");
//           return;
//         }

//         // PayFast sends the recurring billing token as `token` on subscription ITNs
//         const pfToken = data.token;
//         const intentId = data.custom_str3;

//         await db().ref(`mk2_users/${uid}/membership`).set(refId);
//         await db()
//           .ref(`mk2_users/${uid}/subscription`)
//           .update({
//             tier: refId,
//             pfToken: pfToken ?? null,
//             status: "active",
//             lastPaymentId: data.pf_payment_id,
//             updatedAt: Date.now(),
//           });

//         if (intentId) {
//           await db().ref(`pending_subscriptions/${intentId}`).update({
//             status: "confirmed",
//             confirmedAt: Date.now(),
//           });
//         }

//         await db()
//           .ref(`mk2_users/${uid}/membershipHistory`)
//           .push({
//             tier: refId,
//             type: "payfast_upgrade",
//             note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
//             timestamp: Date.now(),
//           });

//         await sendToUser(
//           uid,
//           "Membership Upgraded! 🏆",
//           `Welcome to ${refId.charAt(0).toUpperCase() + refId.slice(1)} membership!`,
//           "profile",
//         );
//         console.log(`✓ Upgraded ${uid} to ${refId}`);
//         return;
//       }

//       console.warn("Unknown payment type:", paymentType);
//     } catch (err) {
//       console.error("ITN processing error:", err);
//     }
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  Log Personal Record (callable function) — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// export const logPR = onCall({ region: "europe-west1" }, async (request) => {
//   const uid = request.auth?.uid;
//   if (!uid)
//     throw new functions.https.HttpsError("unauthenticated", "Not logged in");

//   const data = request.data;
//   const required = [
//     "exercise_id",
//     "value",
//     "displayValue",
//     "category",
//     "level",
//   ];
//   for (const field of required) {
//     if (!data[field]) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         `Missing ${field}`,
//       );
//     }
//   }

//   const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//   const user = userSnap.val();
//   if (!user)
//     throw new functions.https.HttpsError("not-found", "User not found");

//   const prData = {
//     uid,
//     athlete: user.name || "Unknown",
//     gender: user.gender === "female" ? "Female" : "Male",
//     level: data.level,
//     category: data.category,
//     exercise_id: data.exercise_id,
//     exercise: data.exercise,
//     value: data.value,
//     unit: data.unit,
//     displayValue: data.displayValue,
//     notes: data.notes || "",
//     date_logged: data.date_logged,
//     timestamp: Date.now(),
//   };

//   const newRef = await db().ref("pr_logbook").push(prData);
//   return { success: true, key: newRef.key };
// });

// // ─────────────────────────────────────────────────────────────────────────────
// //  Push notification callables — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// export const sendPushNotification = onCall(
//   { region: "europe-west1" },
//   async (request) => {
//     const { token, title, body, type } = request.data as {
//       token: string;
//       title: string;
//       body: string;
//       type?: string;
//     };

//     if (!token || !title || !body) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "token, title and body are required",
//       );
//     }

//     const message: admin.messaging.Message = {
//       token,
//       notification: { title, body },
//       webpush: {
//         notification: {
//           title,
//           body,
//           icon: "/icon-192.png",
//           badge: "/icon-192.png",
//         },
//         fcmOptions: { link: "/" },
//       },
//       data: { type: type ?? "general" },
//     };

//     const response = await admin.messaging().send(message);
//     return { success: true, messageId: response };
//   },
// );

// export const sendPushBroadcast = onCall(
//   { region: "europe-west1" },
//   async (request) => {
//     const { tokens, title, body, type } = request.data as {
//       tokens: string[];
//       title: string;
//       body: string;
//       type?: string;
//     };

//     if (!tokens?.length || !title || !body) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "tokens[], title and body are required",
//       );
//     }

//     const chunks: string[][] = [];
//     for (let i = 0; i < tokens.length; i += 500) {
//       chunks.push(tokens.slice(i, i + 500));
//     }

//     let successCount = 0;
//     let failureCount = 0;
//     const cleanupPromises: Promise<any>[] = [];

//     for (const chunk of chunks) {
//       const multicast: admin.messaging.MulticastMessage = {
//         tokens: chunk,
//         notification: { title, body },
//         webpush: {
//           notification: {
//             title,
//             body,
//             icon: "/icon-192.png",
//             badge: "/icon-192.png",
//           },
//           fcmOptions: { link: "/" },
//         },
//         data: { type: type ?? "general" },
//       };

//       const response = await admin.messaging().sendEachForMulticast(multicast);
//       successCount += response.successCount;
//       failureCount += response.failureCount;

//       response.responses.forEach((resp, idx) => {
//         if (
//           !resp.success &&
//           (resp.error?.code === "messaging/invalid-registration-token" ||
//             resp.error?.code === "messaging/registration-token-not-registered")
//         ) {
//           const badToken = chunk[idx];
//           cleanupPromises.push(
//             db()
//               .ref("mk2_users")
//               .once("value")
//               .then((snap) =>
//                 snap.forEach((user) => {
//                   if (user.child("fcmToken").val() === badToken) {
//                     user.ref.child("fcmToken").remove();
//                   }
//                 }),
//               ),
//           );
//         }
//       });
//     }

//     await Promise.all(cleanupPromises);
//     return { success: true, successCount, failureCount };
//   },
// );

// import * as functions from "firebase-functions/v2";
// import { onRequest, onCall } from "firebase-functions/v2/https";
// import { onSchedule } from "firebase-functions/v2/scheduler";
// // import { defineSecret, defineString } from "firebase-functions/params";
// import { defineSecret } from "firebase-functions/params";
// import * as admin from "firebase-admin";
// import * as crypto from "crypto";

// // ── Exports for modularised functions ──────────────────────────────────────
// export { payfastSign } from "./payfastSign";
// export {
//   cancelSubscription,
//   scheduleDowngrade,
// } from "./subscriptionManagement";
// export { payfastWebhook, releaseStalePendingBookings } from "./payfastWebhook";

// // import * as nodemailer from "nodemailer"; // re-enable once email is set up

// admin.initializeApp();

// function db() {
//   return admin.database();
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Secrets & config — nothing sensitive lives in code or a .env file.
// //  Set these once with:
// //    firebase functions:secrets:set PAYFAST_MERCHANT_ID
// //    firebase functions:secrets:set PAYFAST_MERCHANT_KEY
// //    firebase functions:secrets:set PAYFAST_PASSPHRASE
// //    firebase functions:secrets:set EMAIL_USER
// //    firebase functions:secrets:set EMAIL_PASS
// //  (OPENAI_API_KEY is a separate secret already used by aiChat below.)
// // ─────────────────────────────────────────────────────────────────────────────
// const PAYFAST_MERCHANT_ID = defineSecret("PAYFAST_MERCHANT_ID");
// const PAYFAST_MERCHANT_KEY = defineSecret("PAYFAST_MERCHANT_KEY");
// const PAYFAST_PASSPHRASE = defineSecret("PAYFAST_PASSPHRASE");
// // ── Email disabled for now — waiting on Gmail 2FA / app password setup ──────
// // Uncomment these two lines once EMAIL_USER and EMAIL_PASS secrets are set:
// // const EMAIL_USER = defineSecret("EMAIL_USER");
// // const EMAIL_PASS = defineSecret("EMAIL_PASS");

// // const FRONTEND_URL = defineString("FRONTEND_URL", {
// //   default: "https://webapp.mktworiversfitness.co.za/",
// // });

// const PAYFAST_HOST = "https://www.payfast.co.za";

// const PAYFAST_IPS = [
//   "197.97.145.144",
//   "197.97.145.145",
//   "197.97.145.146",
//   "197.97.145.147",
//   "41.74.179.194",
//   "41.74.179.195",
//   "41.74.179.196",
//   "41.74.179.197",
// ];

// const PAYFAST_SECRETS = [
//   PAYFAST_MERCHANT_ID,
//   PAYFAST_MERCHANT_KEY,
//   PAYFAST_PASSPHRASE,
//   // EMAIL_USER, EMAIL_PASS — re-add once email is set up
// ];

// // ─────────────────────────────────────────────────────────────────────────────
// //  Email helper — transporter built lazily so secret values are read at
// //  request time, not at module load time.
// // ─────────────────────────────────────────────────────────────────────────────
// async function sendEmail(to: string, subject: string, text: string) {
//   // ── EMAIL DISABLED ──────────────────────────────────────────────────────
//   console.log(`📧 [email disabled] Would have sent "${subject}" to ${to}`);
//   return;

//   /*
//   if (!to) return;
//   try {
//     const transporter = nodemailer.createTransport({
//       service: "gmail",
//       auth: {
//         user: EMAIL_USER.value(),
//         pass: EMAIL_PASS.value(),
//       },
//     });
//     await transporter.sendMail({
//       from: `"MK2 Fitness" <${EMAIL_USER.value()}>`,
//       to,
//       subject,
//       text,
//     });
//     console.log("📧 Email sent to:", to);
//   } catch (err: any) {
//     console.error("Email error:", err.message);
//   }
//   */
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  AI Chat (OpenAI) — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
// const OPENAI_MODEL = "gpt-4o-mini";

// const QUOTA: Record<string, number> = {
//   unlimited_12m: 100,
//   unlimited_6m: 100,
//   unlimited_m2m: 100,
//   hybrid_12m: 20,
//   hybrid_6m: 20,
//   hybrid_m2m: 20,
//   u18: 20,
//   gold: 100,
//   silver: 20,
//   basic: 0,
// };

// function nextMonthFirst(): number {
//   const d = new Date();
//   d.setMonth(d.getMonth() + 1);
//   d.setDate(1);
//   d.setHours(0, 0, 0, 0);
//   return d.getTime();
// }

// async function checkAndIncrementQuota(uid: string): Promise<number> {
//   const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//   const user = userSnap.val();
//   if (!user)
//     throw new functions.https.HttpsError("not-found", "User not found");

//   const membership = user.membership ?? "basic";

//   if (membership === "basic") {
//     throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
//   }

//   const total = QUOTA[membership] ?? 0;
//   if (total === 0) {
//     throw new functions.https.HttpsError("permission-denied", "JOIN_GYM");
//   }

//   const quotaRef = db().ref(`mk2_users/${uid}/aiQuota`);
//   const quotaSnap = await quotaRef.once("value");
//   let quota = quotaSnap.val() as {
//     remaining: number;
//     total: number;
//     resetDate: number;
//   } | null;

//   const now = Date.now();
//   if (!quota || !quota.resetDate || now >= quota.resetDate) {
//     quota = { remaining: total, total, resetDate: nextMonthFirst() };
//   }

//   if (quota.remaining <= 0) {
//     throw new functions.https.HttpsError(
//       "resource-exhausted",
//       "QUOTA_EXCEEDED",
//     );
//   }

//   const newRemaining = quota.remaining - 1;
//   await quotaRef.set({
//     remaining: newRemaining,
//     total: quota.total,
//     resetDate: quota.resetDate,
//   });

//   return newRemaining;
// }

// async function callOpenAI(
//   apiKey: string,
//   systemPrompt: string,
//   messages: any[],
// ): Promise<string> {
//   const response = await fetch(OPENAI_API_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${apiKey}`,
//     },
//     body: JSON.stringify({
//       model: OPENAI_MODEL,
//       max_tokens: 1500,
//       messages: [{ role: "system", content: systemPrompt }, ...messages],
//     }),
//   });

//   if (!response.ok) {
//     const err = await response.text();
//     console.error("OpenAI API error:", response.status, err);
//     throw new functions.https.HttpsError(
//       "internal",
//       `OpenAI API error: ${response.status}`,
//     );
//   }

//   const data = await response.json();
//   const text = data.choices?.[0]?.message?.content ?? "";

//   if (!text) {
//     throw new functions.https.HttpsError("internal", "EMPTY_RESPONSE");
//   }

//   return text;
// }

// export const aiChat = onCall(
//   {
//     region: "europe-west1",
//     secrets: ["OPENAI_API_KEY"],
//     timeoutSeconds: 120,
//     memory: "512MiB",
//   },
//   async (request) => {
//     const uid = request.auth?.uid;
//     if (!uid) {
//       throw new functions.https.HttpsError("unauthenticated", "Not logged in");
//     }

//     const { mode, prompt, systemPrompt, fileData, mediaType, isPDF } =
//       request.data as {
//         mode: string;
//         prompt?: string;
//         systemPrompt?: string;
//         fileData?: string;
//         mediaType?: string;
//         isPDF?: boolean;
//       };

//     const quotaRemaining = await checkAndIncrementQuota(uid);

//     const apiKey = process.env.OPENAI_API_KEY;
//     if (!apiKey) {
//       throw new functions.https.HttpsError(
//         "internal",
//         "API key not configured",
//       );
//     }

//     const sysPrompt =
//       systemPrompt ||
//       "You are a helpful fitness assistant at MK2 Rivers Fitness, South Africa.";

//     if (mode === "inbody_extract") {
//       if (!fileData || !mediaType) {
//         throw new functions.https.HttpsError(
//           "invalid-argument",
//           "fileData and mediaType are required for inbody_extract mode",
//         );
//       }

//       if (isPDF) {
//         throw new functions.https.HttpsError(
//           "invalid-argument",
//           "PDF extraction is not supported with the current AI provider — please upload an image instead.",
//         );
//       }

//       const messages = [
//         {
//           role: "user",
//           content: [
//             {
//               type: "text",
//               text:
//                 prompt ||
//                 `Extract InBody values as JSON with keys: weight, bodyFat, muscleMass, fatMass, visceralFat, totalBodyWater. Respond ONLY with the JSON object.`,
//             },
//             {
//               type: "image_url",
//               image_url: { url: `data:${mediaType};base64,${fileData}` },
//             },
//           ],
//         },
//       ];

//       const response = await callOpenAI(apiKey, sysPrompt, messages);
//       return { response, quotaRemaining };
//     }

//     if (!prompt) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "prompt is required for this mode",
//       );
//     }

//     const messages = [{ role: "user", content: prompt }];
//     const response = await callOpenAI(apiKey, sysPrompt, messages);
//     return { response, quotaRemaining };
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  Notification helpers — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────

// async function writeNotification(
//   uid: string,
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   await db()
//     .ref(`users/${uid}/notifications`)
//     .push({
//       title,
//       body,
//       message: body,
//       timestamp: Date.now(),
//       read: false,
//       createdAt: Date.now(),
//       ...(link ? { link } : {}),
//     });
// }

// async function writeNotificationForAll(
//   uidTokenPairs: { uid: string }[],
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   const writes = uidTokenPairs.map(({ uid }) =>
//     writeNotification(uid, title, body, link),
//   );
//   await Promise.all(writes);
// }

// async function getUserToken(uid: string): Promise<string | null> {
//   const snap = await db().ref(`mk2_users/${uid}/fcmToken`).once("value");
//   return snap.val() as string | null;
// }

// async function getUserPrefs(uid: string): Promise<Record<string, boolean>> {
//   const snap = await db()
//     .ref(`mk2_users/${uid}/notificationPrefs`)
//     .once("value");
//   return snap.val() || {};
// }

// async function sendToTokens(tokens: string[], title: string, body: string) {
//   if (tokens.length === 0) return;

//   const unique = [...new Set(tokens.filter(Boolean))];
//   if (unique.length === 0) return;

//   const message: admin.messaging.MulticastMessage = {
//     notification: { title, body },
//     tokens: unique,
//   };

//   const response = await admin.messaging().sendEachForMulticast(message);

//   const cleanupPromises: Promise<any>[] = [];
//   response.responses.forEach((resp, idx) => {
//     if (
//       !resp.success &&
//       (resp.error?.code === "messaging/invalid-registration-token" ||
//         resp.error?.code === "messaging/registration-token-not-registered")
//     ) {
//       const badToken = unique[idx];
//       cleanupPromises.push(
//         db()
//           .ref("mk2_users")
//           .once("value")
//           .then((snap) =>
//             snap.forEach((user) => {
//               if (user.child("fcmToken").val() === badToken) {
//                 user.ref.child("fcmToken").remove();
//               }
//             }),
//           ),
//       );
//     }
//   });

//   await Promise.all(cleanupPromises);
// }

// async function sendToUser(
//   uid: string,
//   title: string,
//   body: string,
//   link?: string,
// ) {
//   const token = await getUserToken(uid);
//   await writeNotification(uid, title, body, link);
//   if (token) await sendToTokens([token], title, body);
//   console.log(`Notification sent + written for ${uid}`);
// }

// async function sendToAllUsers(
//   title: string,
//   body: string,
//   prefKey?: string,
//   link?: string,
// ) {
//   const usersSnap = await db().ref("mk2_users").once("value");
//   const tokens: string[] = [];
//   const eligibleUids: { uid: string }[] = [];

//   usersSnap.forEach((user) => {
//     if (!user.key) return;
//     if (prefKey) {
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs[prefKey] === false) return;
//     }
//     eligibleUids.push({ uid: user.key });
//     const token = user.child("fcmToken").val() as string | null;
//     if (token) tokens.push(token);
//   });

//   await writeNotificationForAll(eligibleUids, title, body, link);
//   await sendToTokens(tokens, title, body);
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  PayFast ITN-verification signature helper.
// //  NOTE: this verifies INCOMING PayFast notifications. It is intentionally
// //  separate from the OUTBOUND request-signing logic in payfastApiClient.ts,
// //  which builds signatures for calls we make TO PayFast's Subscriptions API.
// //  Do not merge these — they sign different things for different purposes.
// // ─────────────────────────────────────────────────────────────────────────────
// function generateSignature(
//   data: Record<string, string>,
//   passphrase = "",
// ): string {
//   const pfData = { ...data };

//   if (passphrase && passphrase.trim() !== "") {
//     (pfData as any).passphrase = passphrase.trim();
//   }

//   const str = Object.keys(pfData)
//     .sort()
//     .map(
//       (k) =>
//         `${k}=${encodeURIComponent(String(pfData[k])).replace(/%20/g, "+")}`,
//     )
//     .join("&");

//   return crypto.createHash("md5").update(str).digest("hex");
// }

// // Fallback lookup by email if custom_str1 (uid) doesn't resolve to a user
// async function findUserRef(
//   userId: string | undefined,
//   email: string | undefined,
// ): Promise<{ ref: admin.database.Reference; key: string } | null> {
//   if (userId) {
//     const snap = await db().ref(`mk2_users/${userId}`).get();
//     if (snap.exists())
//       return { ref: db().ref(`mk2_users/${userId}`), key: userId };
//   }
//   if (email) {
//     const snap = await db()
//       .ref("mk2_users")
//       .orderByChild("email")
//       .equalTo(email)
//       .limitToFirst(1)
//       .get();
//     if (snap.exists()) {
//       const key = Object.keys(snap.val())[0];
//       return { ref: db().ref(`mk2_users/${key}`), key };
//     }
//   }
//   return null;
// }

// // ─────────────────────────────────────────────────────────────────────────────
// //  Existing triggers — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────

// export const onClassBookingCreate = functions.database.onValueCreated(
//   {
//     ref: "/class_bookings/{classDay}/{userId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const userId = event.params.userId;
//     const classDay = event.params.classDay;
//     const bookingData = event.data.val();

//     if (bookingData?.paid === true) {
//       console.log(
//         `onClassBookingCreate: skipping paid booking for ${userId} — payfastNotify handles notification`,
//       );
//       return null;
//     }

//     const prefs = await getUserPrefs(userId);
//     if (prefs.classReminders === false) return null;

//     await sendToUser(
//       userId,
//       "Class Booking Confirmed 🏋️",
//       `You are booked for the class on ${classDay}. See you there!`,
//       "classes",
//     );
//     return null;
//   },
// );

// export const onMessageCreate = functions.database.onValueCreated(
//   {
//     ref: "/rooms/{roomId}/messages/{messageId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const roomId = event.params.roomId;
//     const message = event.data.val() as {
//       uid: string;
//       user?: string;
//       text?: string;
//     };
//     if (!message) return null;

//     const usersSnap = await db().ref("mk2_users").once("value");
//     const tokens: string[] = [];
//     const eligibleUids: { uid: string }[] = [];

//     usersSnap.forEach((user) => {
//       if (!user.key || user.key === message.uid) return;
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs.community === false) return;
//       const joinedRooms = user.child("joinedRooms").val() || {};
//       if (!joinedRooms[roomId]) return;
//       eligibleUids.push({ uid: user.key });
//       const token = user.child("fcmToken").val() as string | null;
//       if (token) tokens.push(token);
//     });

//     const title = `💬 New message in ${roomId}`;
//     const body = message.text
//       ? `${message.user || "Someone"}: ${message.text.slice(0, 100)}`
//       : `${message.user || "Someone"} sent a file`;

//     await writeNotificationForAll(eligibleUids, title, body, "community");
//     await sendToTokens(tokens, title, body);
//     return null;
//   },
// );

// export const onPollCreate = functions.database.onValueCreated(
//   {
//     ref: "/rooms/{roomId}/polls/{pollId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const poll = event.data.val() as { uid: string; question?: string };
//     const roomId = event.params.roomId;
//     if (!poll) return null;

//     const usersSnap = await db().ref("mk2_users").once("value");
//     const tokens: string[] = [];
//     const eligibleUids: { uid: string }[] = [];

//     usersSnap.forEach((user) => {
//       if (!user.key || user.key === poll.uid) return;
//       const prefs = user.child("notificationPrefs").val() || {};
//       if (prefs.community === false) return;
//       const joinedRooms = user.child("joinedRooms").val() || {};
//       if (!joinedRooms[roomId]) return;
//       eligibleUids.push({ uid: user.key });
//       const token = user.child("fcmToken").val() as string | null;
//       if (token) tokens.push(token);
//     });

//     const title = `📊 New Poll in ${roomId}`;
//     const body = poll.question || "A new poll has been posted. Go vote!";

//     await writeNotificationForAll(eligibleUids, title, body, "community");
//     await sendToTokens(tokens, title, body);
//     return null;
//   },
// );

// export const onNewsPostCreate = functions.database.onValueCreated(
//   {
//     ref: "/admin_news/{newsId}",
//     instance: "gym-pro-20ee6-default-rtdb",
//     region: "europe-west1",
//   },
//   async (event: any) => {
//     const news = event.data.val() as {
//       title?: string;
//       content?: string;
//       status?: string;
//     };

//     if (news?.status === "draft") {
//       console.log(
//         "onNewsPostCreate: skipping draft post — no notification sent",
//       );
//       return null;
//     }

//     await sendToAllUsers(
//       news.title || "📢 News Update",
//       news.content || "Read the latest news from MK Two Rivers.",
//       "gymNews",
//     );
//     return null;
//   },
// );

// export const checkinReminder = onSchedule(
//   {
//     schedule: "0 9 * * 1-6",
//     timeZone: "Africa/Johannesburg",
//     region: "europe-west1",
//   },
//   async () => {
//     const now = new Date(
//       new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" }),
//     );
//     const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

//     const bookingsSnap = await db().ref("class_bookings").once("value");
//     if (!bookingsSnap.exists()) return;

//     const bookedUids = new Set<string>();
//     bookingsSnap.forEach((classNode) => {
//       if (!classNode.key?.endsWith(todayKey)) return;
//       classNode.forEach((userNode) => {
//         if (userNode.key) bookedUids.add(userNode.key);
//       });
//     });

//     if (bookedUids.size === 0) {
//       console.log(
//         `checkinReminder: no bookings found for ${todayKey}, skipping.`,
//       );
//       return;
//     }

//     const sends = [...bookedUids].map(async (uid) => {
//       const prefs = await getUserPrefs(uid);
//       if (prefs.classReminders === false) return;
//       await sendToUser(
//         uid,
//         "Class Reminder 🏋️",
//         "You have a class booked today — don't forget to check in at the gym!",
//         "classes",
//       );
//     });

//     await Promise.all(sends);
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  PayFast ITN webhook — handles class_booking, credits, membership + full
// //  subscription lifecycle (COMPLETE / CANCELLED / FAILED), with dedup, IP
// //  whitelist, signature check, and PayFast's server-to-server validate.
// //
// //  ⚠️ ARCHITECTURE NOTE (unresolved — see chat): this project currently has
// //  TWO webhook functions — this one (payfastNotify) and payfastWebhook.ts.
// //  Bookingengine.ts's class-booking and credit-pack flows point their
// //  notify_url at payfastWebhook, NOT this function. That means the
// //  class_booking and credits branches below only run if something points
// //  notify_url here instead. Do not assume both are live until you've
// //  confirmed which notify_url each flow actually uses.
// // ─────────────────────────────────────────────────────────────────────────────
// export const payfastNotify = onRequest(
//   { region: "europe-west1", secrets: PAYFAST_SECRETS },
//   async (req: any, res: any) => {
//     // ── CORS ─────────────────────────────────────────────────────────────
//     res.set("Access-Control-Allow-Origin", "*");
//     res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
//     res.set("Access-Control-Allow-Headers", "Content-Type");

//     if (req.method === "OPTIONS") {
//       res.status(204).send("");
//       return;
//     }

//     if (req.method !== "POST") {
//       res.status(405).send("Method not allowed");
//       return;
//     }
//     // Always ack fast — PayFast retries aggressively if it doesn't get a 200.
//     // IMPORTANT: this is the ONLY res.send() call in this handler. Every
//     // branch below uses a bare `return;` — do not add more res.send() calls,
//     // since the response has already been sent to the client at this point.
//     res.status(200).send("OK");

//     const data = req.body as Record<string, string>;

//     try {
//       // ── 1. Dedup ───────────────────────────────────────────────────────
//       const paymentId = data.pf_payment_id;
//       if (paymentId) {
//         const existing = await db().ref(`processedPayments/${paymentId}`).get();
//         if (existing.exists()) {
//           console.log("⚠️ Duplicate ITN ignored:", paymentId);
//           return;
//         }
//         await db().ref(`processedPayments/${paymentId}`).set(true);
//       }

//       console.log("📩 ITN received:", JSON.stringify(data));

//       // ── 2. IP whitelist ────────────────────────────────────────────────
//       const callerIp = (
//         req.headers["x-forwarded-for"]?.split(",")[0] ||
//         req.socket.remoteAddress ||
//         ""
//       ).trim();
//       if (!PAYFAST_IPS.includes(callerIp)) {
//         console.error(`ITN blocked — bad IP: ${callerIp}`);
//         return;
//       }

//       // ── 3. Local signature check ──────────────────────────────────────
//       const received = { ...data };
//       const theirSig = received.signature;
//       delete received.signature;
//       const ourSig = generateSignature(received, PAYFAST_PASSPHRASE.value());
//       if (ourSig !== theirSig) {
//         console.error("ITN blocked — signature mismatch");
//         return;
//       }

//       // ── 4. Server-to-server confirm with PayFast ──────────────────────
//       const paramString = Object.entries(data)
//         .filter(([key]) => key !== "signature")
//         .map(
//           ([k, v]) =>
//             `${k}=${encodeURIComponent(v ?? "").replace(/%20/g, "+")}`,
//         )
//         .join("&");

//       const validRes = await fetch(`${PAYFAST_HOST}/eng/query/validate`, {
//         method: "POST",
//         headers: { "Content-Type": "application/x-www-form-urlencoded" },
//         body: paramString,
//       });
//       const validText = await validRes.text();

//       if (validText.trim() !== "VALID") {
//         console.error("ITN blocked — PayFast validation failed:", validText);
//         return;
//       }

//       const status = data.payment_status;
//       const uid = data.custom_str1;
//       const refId = data.custom_str2;
//       const paymentType = data.custom_str4;
//       const email = data.email_address;

//       // ── CANCELLED — subscription ended, PayFast will not bill again ────
//       if (status === "CANCELLED") {
//         if (paymentType === "membership") {
//           const found = await findUserRef(uid, email);
//           if (!found) {
//             console.error(
//               `CANCELLED: user not found — uid=${uid}, email=${email}`,
//             );
//             return;
//           }
//           const { ref: userRef, key: userKey } = found;
//           const userSnap = await userRef.get();
//           const userData = userSnap.val() || {};
//           const pendingDowngrade = userData.pendingDowngrade as
//             | { tier: string; billing?: string }
//             | null
//             | undefined;

//           // ── Scheduled downgrade → move to the lower tier instead of Basic ──
//           if (pendingDowngrade && pendingDowngrade.tier) {
//             const targetTier = pendingDowngrade.tier;
//             const targetBilling = pendingDowngrade.billing || "monthly";
//             const totalQuota = QUOTA[targetTier] ?? 0;

//             await userRef.update({
//               membership: targetTier,
//               membershipBilling: targetBilling,
//               membershipSince: Date.now(),
//               membershipUpdatedAt: Date.now(),
//               subscriptionToken: null,
//               aiQuota:
//                 totalQuota > 0
//                   ? {
//                       remaining: totalQuota,
//                       total: totalQuota,
//                       resetDate: nextMonthFirst(),
//                     }
//                   : null,
//               cancelledAt: null,
//               cancellationPending: false,
//               cancellationRequestedAt: null,
//               pendingDowngrade: null,
//             });

//             await db().ref(`paymentHistory/${userKey}`).push({
//               event: "downgraded",
//               tier: targetTier,
//               date: Date.now(),
//             });

//             console.log(`⬇️ DOWNGRADED: ${userKey} → ${targetTier}`);

//             await sendEmail(
//               email,
//               "Your Membership Has Changed - MK2 Fitness",
//               `Hi,\n\nYour plan has now moved to ${targetTier.toUpperCase()} as requested.\n\nNote: since your previous subscription was cancelled, you'll need to visit the Membership page to reconfirm billing if you'd like this plan to continue renewing automatically.\n\n- MK2 Team`,
//             );

//             await sendToUser(
//               userKey,
//               "Plan Changed",
//               `Your membership is now on the ${targetTier} plan.`,
//               "profile",
//             );
//             return;
//           }

//           // ── Plain cancellation → Basic ──────────────────────────────────
//           await userRef.update({
//             membership: "basic",
//             membershipBilling: null,
//             subscriptionToken: null,
//             membershipUpdatedAt: Date.now(),
//             cancelledAt: Date.now(),
//             aiQuota: null,
//             cancellationPending: false,
//             cancellationRequestedAt: null,
//             pendingDowngrade: null,
//           });

//           await db().ref(`paymentHistory/${userKey}`).push({
//             event: "cancelled",
//             date: Date.now(),
//           });

//           console.log(`⚠️ CANCELLED: ${userKey} → basic`);

//           await sendEmail(
//             email,
//             "❌ Subscription Cancelled - MK2 Membership",
//             `Hi,\n\nYour subscription has now ended and you have been moved to the Basic plan.\n\nWe're sorry to see you go — you're always welcome back!\n\n- MK2 Team`,
//           );

//           await sendToUser(
//             userKey,
//             "Subscription Ended",
//             "Your membership has moved to the Basic plan.",
//             "profile",
//           );
//         }
//         return;
//       }

//       // ── FAILED — card declined, PayFast retries automatically ──────────
//       if (status === "FAILED") {
//         if (paymentType === "membership") {
//           const found = await findUserRef(uid, email);
//           if (!found) {
//             console.error(
//               `FAILED: user not found — uid=${uid}, email=${email}`,
//             );
//             return;
//           }
//           const { ref: userRef, key: userKey } = found;

//           await userRef.update({ membershipFailedAt: Date.now() });

//           await db()
//             .ref(`paymentHistory/${userKey}`)
//             .push({
//               event: "failed",
//               paymentId: data.pf_payment_id || null,
//               date: Date.now(),
//             });

//           console.log(`❌ FAILED: ${userKey} — PayFast will retry`);

//           await sendEmail(
//             email,
//             "⚠️ Payment Failed - MK2 Membership",
//             `Hi,\n\nYour recent payment attempt failed.\n\nPayFast will retry automatically, but please ensure:\n- Your card has sufficient funds\n- Your payment method is valid\n\nIf the issue continues, your subscription may be cancelled.\n\n- MK2 Team`,
//           );

//           await sendToUser(
//             userKey,
//             "⚠️ Payment Failed",
//             "Your recent membership payment failed. We'll retry automatically — please check your card details.",
//             "profile",
//           );
//         }
//         return;
//       }

//       // Only COMPLETE continues past this point.
//       if (status !== "COMPLETE") {
//         console.log(`ℹ️ ITN status ignored: ${status}`);
//         return;
//       }

//       // ── CLASS BOOKING ────────────────────────────────────────────────────
//       // FIXED: reads from pending_bookings (what Bookingengine.ts actually
//       // writes), not the old mk2_bookings path, and only destructures fields
//       // that actually exist on a PendingBooking record. category/trainer
//       // are looked up from admin_classes via classId instead of assumed.
//       if (paymentType === "class_booking") {
//         const bookingId = uid; // custom_str1 = the pending_bookings key
//         const price = parseFloat(data.amount);

//         const bookingRef = db().ref(`pending_bookings/${bookingId}`);
//         const bookingSnap = await bookingRef.get();
//         if (!bookingSnap.exists()) {
//           console.error(`Booking ${bookingId} not found in pending_bookings`);
//           return;
//         }

//         const booking = bookingSnap.val();
//         if (booking.status !== "pending_payment") {
//           console.log(
//             `Booking ${bookingId} already processed (${booking.status})`,
//           );
//           return;
//         }

//         await bookingRef.update({
//           status: "confirmed",
//           confirmedAt: Date.now(),
//           payfastPfPaymentId: data.pf_payment_id,
//         });

//         const {
//           userId,
//           userEmail,
//           userName,
//           className,
//           dateKey,
//           dateDisplay,
//           time,
//           classId,
//         } = booking;

//         const safeKey = (str: string) => str.replace(/[^a-zA-Z0-9_-]/g, "_");
//         const classBookingKey = `${safeKey(className)}_${dateKey}`;

//         await db().ref(`class_bookings/${classBookingKey}/${userId}`).set({
//           name: userName,
//           email: userEmail,
//           bookedAt: Date.now(),
//           paid: true,
//           amount: price,
//           status: "confirmed",
//         });

//         let category = "Class";
//         let trainer = "Coach";
//         if (classId) {
//           const clsSnap = await db().ref(`admin_classes/${classId}`).get();
//           if (clsSnap.exists()) {
//             const cls = clsSnap.val();
//             category = cls.category || category;
//             trainer = cls.trainer || trainer;
//           }
//           await db()
//             .ref(`admin_classes/${classId}`)
//             .transaction((current) => {
//               if (current) current.bookedCount = (current.bookedCount || 0) + 1;
//               return current;
//             });
//         }

//         const newBooking = {
//           name: className,
//           time,
//           dateKey,
//           displayDate: dateDisplay,
//           category,
//           trainer,
//           price,
//         };

//         const userBookingsRef = db().ref(`mk2_users/${userId}/bookings`);
//         const userBookingsSnap = await userBookingsRef.get();
//         const existingBookings: any[] = userBookingsSnap.val() || [];
//         const alreadyListed = existingBookings.some(
//           (b: any) => b.name === className && b.dateKey === dateKey,
//         );
//         if (!alreadyListed) {
//           await userBookingsRef.set([...existingBookings, newBooking]);
//         }

//         await sendToUser(
//           userId,
//           "Class Booking Confirmed 🏋️",
//           `Your payment for ${className} on ${dateDisplay} was successful. See you there!`,
//           "classes",
//         );

//         console.log(
//           `✓ Class booking confirmed: ${bookingId} for user ${userId}`,
//         );
//         return;
//       }

//       // ── CREDITS PURCHASE ─────────────────────────────────────────────────
//       // ⚠️ NOT YET VERIFIED against Bookingengine.ts's initiatePayFastForPack,
//       // which sends credits via custom_int1 and points notify_url at
//       // payfastWebhook, not here. If you route credit-pack purchases to this
//       // function instead, change `data.custom_str3` below to `data.custom_int1`.
//       if (paymentType === "credits") {
//         if (!uid) {
//           console.error("Credits ITN missing uid");
//           return;
//         }
//         const credits = parseInt(data.custom_int1 ?? "0", 10);
//         const credRef = db().ref(`mk2_users/${uid}/classCredits`);
//         const snap = await credRef.once("value");
//         const current = snap.exists() ? (snap.val() as number) : 0;
//         await credRef.set(current + credits);

//         await db()
//           .ref(`mk2_users/${uid}/creditHistory`)
//           .push({
//             amount: credits,
//             type: "payfast_purchase",
//             note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
//             timestamp: Date.now(),
//           });

//         await sendToUser(
//           uid,
//           "Credits Added! 🎟",
//           `${credits} class credits have been added to your account.`,
//           "classes",
//         );
//         console.log(`✓ Added ${credits} credits to ${uid}`);
//         return;
//       }

//       // ── MEMBERSHIP (first payment OR a recurring renewal) ────────────────
//       if (paymentType === "membership") {
//         if (!uid) {
//           console.error("Membership ITN missing uid");
//           return;
//         }

//         // PayFast sends the recurring billing token as `token` on subscription ITNs
//         const pfToken = data.token;
//         const intentId = data.custom_str3;

//         await db().ref(`mk2_users/${uid}/membership`).set(refId);
//         await db()
//           .ref(`mk2_users/${uid}/subscription`)
//           .update({
//             tier: refId,
//             pfToken: pfToken ?? null,
//             status: "active",
//             lastPaymentId: data.pf_payment_id,
//             updatedAt: Date.now(),
//           });

//         if (intentId) {
//           await db().ref(`pending_subscriptions/${intentId}`).update({
//             status: "confirmed",
//             confirmedAt: Date.now(),
//           });
//         }

//         await db()
//           .ref(`mk2_users/${uid}/membershipHistory`)
//           .push({
//             tier: refId,
//             type: "payfast_upgrade",
//             note: `PayFast: ${data.item_name} (${data.m_payment_id})`,
//             timestamp: Date.now(),
//           });

//         await sendToUser(
//           uid,
//           "Membership Upgraded! 🏆",
//           `Welcome to ${refId.charAt(0).toUpperCase() + refId.slice(1)} membership!`,
//           "profile",
//         );
//         console.log(`✓ Upgraded ${uid} to ${refId}`);
//         return;
//       }

//       console.warn("Unknown payment type:", paymentType);
//     } catch (err) {
//       console.error("ITN processing error:", err);
//     }
//   },
// );

// // ─────────────────────────────────────────────────────────────────────────────
// //  Log Personal Record (callable function) — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// export const logPR = onCall({ region: "europe-west1" }, async (request) => {
//   const uid = request.auth?.uid;
//   if (!uid)
//     throw new functions.https.HttpsError("unauthenticated", "Not logged in");

//   const data = request.data;
//   const required = [
//     "exercise_id",
//     "value",
//     "displayValue",
//     "category",
//     "level",
//   ];
//   for (const field of required) {
//     if (!data[field]) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         `Missing ${field}`,
//       );
//     }
//   }

//   const userSnap = await db().ref(`mk2_users/${uid}`).once("value");
//   const user = userSnap.val();
//   if (!user)
//     throw new functions.https.HttpsError("not-found", "User not found");

//   const prData = {
//     uid,
//     athlete: user.name || "Unknown",
//     gender: user.gender === "female" ? "Female" : "Male",
//     level: data.level,
//     category: data.category,
//     exercise_id: data.exercise_id,
//     exercise: data.exercise,
//     value: data.value,
//     unit: data.unit,
//     displayValue: data.displayValue,
//     notes: data.notes || "",
//     date_logged: data.date_logged,
//     timestamp: Date.now(),
//   };

//   const newRef = await db().ref("pr_logbook").push(prData);
//   return { success: true, key: newRef.key };
// });

// // ─────────────────────────────────────────────────────────────────────────────
// //  Push notification callables — unchanged from your live file
// // ─────────────────────────────────────────────────────────────────────────────
// export const sendPushNotification = onCall(
//   { region: "europe-west1" },
//   async (request) => {
//     const { token, title, body, type } = request.data as {
//       token: string;
//       title: string;
//       body: string;
//       type?: string;
//     };

//     if (!token || !title || !body) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "token, title and body are required",
//       );
//     }

//     const message: admin.messaging.Message = {
//       token,
//       notification: { title, body },
//       webpush: {
//         notification: {
//           title,
//           body,
//           icon: "/icon-192.png",
//           badge: "/icon-192.png",
//         },
//         fcmOptions: { link: "/" },
//       },
//       data: { type: type ?? "general" },
//     };

//     const response = await admin.messaging().send(message);
//     return { success: true, messageId: response };
//   },
// );

// export const sendPushBroadcast = onCall(
//   { region: "europe-west1" },
//   async (request) => {
//     const { tokens, title, body, type } = request.data as {
//       tokens: string[];
//       title: string;
//       body: string;
//       type?: string;
//     };

//     if (!tokens?.length || !title || !body) {
//       throw new functions.https.HttpsError(
//         "invalid-argument",
//         "tokens[], title and body are required",
//       );
//     }

//     const chunks: string[][] = [];
//     for (let i = 0; i < tokens.length; i += 500) {
//       chunks.push(tokens.slice(i, i + 500));
//     }

//     let successCount = 0;
//     let failureCount = 0;
//     const cleanupPromises: Promise<any>[] = [];

//     for (const chunk of chunks) {
//       const multicast: admin.messaging.MulticastMessage = {
//         tokens: chunk,
//         notification: { title, body },
//         webpush: {
//           notification: {
//             title,
//             body,
//             icon: "/icon-192.png",
//             badge: "/icon-192.png",
//           },
//           fcmOptions: { link: "/" },
//         },
//         data: { type: type ?? "general" },
//       };

//       const response = await admin.messaging().sendEachForMulticast(multicast);
//       successCount += response.successCount;
//       failureCount += response.failureCount;

//       response.responses.forEach((resp, idx) => {
//         if (
//           !resp.success &&
//           (resp.error?.code === "messaging/invalid-registration-token" ||
//             resp.error?.code === "messaging/registration-token-not-registered")
//         ) {
//           const badToken = chunk[idx];
//           cleanupPromises.push(
//             db()
//               .ref("mk2_users")
//               .once("value")
//               .then((snap) =>
//                 snap.forEach((user) => {
//                   if (user.child("fcmToken").val() === badToken) {
//                     user.ref.child("fcmToken").remove();
//                   }
//                 }),
//               ),
//           );
//         }
//       });
//     }

//     await Promise.all(cleanupPromises);
//     return { success: true, successCount, failureCount };
//   },
// );
