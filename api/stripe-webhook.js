const crypto = require("crypto");
const { callGoogleAppsScript } = require("./_lib/google-apps-script");

const readRawBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

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

  const event = JSON.parse(rawBody.toString("utf8"));
  const session = event.data?.object || {};
  const orderId = session.metadata?.order_id || session.client_reference_id;

  try {
    if (
      orderId &&
      (event.type === "checkout.session.async_payment_succeeded" ||
        (event.type === "checkout.session.completed" &&
          session.payment_status === "paid"))
    ) {
      await callGoogleAppsScript({
        action: "payment_completed",
        orderId,
        stripeSessionId: session.id,
        paymentIntentId: session.payment_intent || "",
        amountTotal: session.amount_total || 0,
        customerEmail: session.customer_details?.email || session.customer_email || "",
      });
    }

    if (
      orderId &&
      (event.type === "checkout.session.expired" ||
        event.type === "checkout.session.async_payment_failed")
    ) {
      await callGoogleAppsScript({
        action: "payment_failed",
        orderId,
        stripeSessionId: session.id,
      });
    }

    return response.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook failed", error);
    return response.status(500).json({ received: false });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
