const crypto = require("crypto");
const {
  callGoogleAppsScript,
  callCinemaGoogleAppsScript,
} = require("./_lib/google-apps-script");

const readRawBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const blockedCinemaEmails = new Set(["lievemalfliet@telenet.be"]);
const blockedCinemaOrderIds = new Set(["CINEMA-20260815-133831-8D416E"]);

const isBlockedCinemaOrder = ({ email, orderId }) =>
  blockedCinemaEmails.has(normalizeKey(email)) ||
  blockedCinemaOrderIds.has(String(orderId || "").trim());

const verifyStripeSignature = (rawBody, signatureHeader, secret) => {
  const parts = String(signatureHeader || "").split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || !signatures.length) {
    return false;
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  return signatures.some((signature) => {
    if (signature.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
};

const syncAppsScript = async ({ appsScript, payload, context }) => {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await appsScript(payload, { timeoutMs: 7000 });
    } catch (error) {
      lastError = error;
      console.error("Stripe webhook Google sync attempt failed", {
        action: payload.action,
        attempt,
        eventType: context.eventType,
        orderId: context.orderId,
        message: error.message,
        status: error.status,
      });

      if (attempt < 2) {
        await wait(600);
      }
    }
  }

  throw lastError;
};

const cinemaOrderPayloadFromSession = (session) => {
  const metadata = session.metadata || {};

  if (metadata.event !== "cinema") {
    return {};
  }

  return {
    event: "Openluchtcinema 2026",
    name: metadata.name || session.customer_details?.name || "",
    email:
      metadata.email ||
      session.customer_details?.email ||
      session.customer_email ||
      "",
    phone: metadata.phone || session.customer_details?.phone || "",
    ratatouilleAdultQuantity: metadata.ratatouilleAdultQuantity || 0,
    ratatouilleChildQuantity: metadata.ratatouilleChildQuantity || 0,
    ratatouilleGiftQuantity: metadata.ratatouilleGiftQuantity || 0,
    orientAdultQuantity: metadata.orientAdultQuantity || 0,
    orientChildQuantity: metadata.orientChildQuantity || 0,
    orientGiftQuantity: metadata.orientGiftQuantity || 0,
  };
};

async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).send("Method not allowed");
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return response.status(503).send("Webhook is not configured");
  }

  const rawBody = await readRawBody(request);

  if (
    !verifyStripeSignature(
      rawBody,
      request.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  ) {
    return response.status(400).send("Invalid signature");
  }

  let event;

  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return response.status(400).send("Invalid payload");
  }

  const session = event.data?.object || {};
  const orderId = session.metadata?.order_id || session.client_reference_id;
  const eventName = session.metadata?.event || "";
  const appsScript = eventName === "cinema"
    ? callCinemaGoogleAppsScript
    : callGoogleAppsScript;
  const isPaymentCompleted =
    event.type === "checkout.session.async_payment_succeeded" ||
    (event.type === "checkout.session.completed" &&
      session.payment_status === "paid");
  const isPaymentFailed =
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed";

  try {
    if (
      eventName === "cinema" &&
      isBlockedCinemaOrder({
        email: cinemaOrderPayloadFromSession(session).email,
        orderId,
      })
    ) {
      return response.status(200).json({
        received: true,
        synced: false,
        blocked: true,
      });
    }

    if (orderId && isPaymentCompleted) {
      await syncAppsScript({
        appsScript,
        payload: {
          action: "payment_completed",
          orderId,
          stripeSessionId: session.id,
          paymentIntentId: session.payment_intent || "",
          amountTotal: session.amount_total || 0,
          customerEmail: session.customer_details?.email || session.customer_email || "",
          ...cinemaOrderPayloadFromSession(session),
        },
        context: { eventType: event.type, orderId },
      });
    }

    if (orderId && isPaymentFailed && session.metadata?.event !== "cinema") {
      await syncAppsScript({
        appsScript,
        payload: {
          action: "payment_failed",
          orderId,
          stripeSessionId: session.id,
          ...cinemaOrderPayloadFromSession(session),
        },
        context: { eventType: event.type, orderId },
      });
    }

    return response.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", {
      eventType: event.type,
      orderId,
      message: error.message,
      status: error.status,
    });

    if (isPaymentFailed) {
      return response.status(200).json({ received: true, synced: false });
    }

    return response.status(500).json({ received: false, synced: false });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
