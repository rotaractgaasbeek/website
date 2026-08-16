const {
  callGoogleAppsScript,
  callCinemaGoogleAppsScript,
} = require("./_lib/google-apps-script");

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const cleanSessionId = (value) => String(value || "").trim().slice(0, 120);

const sessionPaymentIntentId = (session) => {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id || "";
};

const isPaidSession = (session) =>
  session.payment_status === "paid" || session.payment_intent?.status === "succeeded";

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

const fetchStripeSession = async (sessionId) => {
  const params = new URLSearchParams({
    "expand[]": "payment_intent",
  });
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    },
  );
  const session = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(session.error?.message || "Stripe-sessie kon niet worden gecontroleerd.");
  }

  return session;
};

const syncAppsScript = async ({ appsScript, payload }) => {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await appsScript(payload, { timeoutMs: 10000 });
    } catch (error) {
      lastError = error;
      console.error("Checkout confirmation sync failed", {
        attempt,
        action: payload.action,
        orderId: payload.orderId,
        message: error.message,
        status: error.status,
      });

      if (attempt < 3) {
        await wait(800);
      }
    }
  }

  throw lastError;
};

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, message: "Methode niet toegestaan." });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return response.status(503).json({
      ok: false,
      message: "Online betalen is nog niet volledig geconfigureerd.",
    });
  }

  const body =
    typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body || {};
  const sessionId = cleanSessionId(body.sessionId);

  if (!sessionId.startsWith("cs_")) {
    return response.status(400).json({ ok: false, message: "Ongeldige betaalreferentie." });
  }

  try {
    const session = await fetchStripeSession(sessionId);
    const metadata = session.metadata || {};
    const eventType = metadata.event || "";
    const orderId = metadata.order_id || session.client_reference_id;

    if (!orderId || (eventType !== "cinema" && eventType !== "bbq")) {
      return response.status(400).json({ ok: false, message: "Onbekende bestelling." });
    }

    if (!isPaidSession(session)) {
      return response.status(202).json({
        ok: true,
        synced: false,
        pending: true,
        paymentStatus: session.payment_status || "",
        paymentIntentStatus: session.payment_intent?.status || "",
      });
    }

    const appsScript = eventType === "cinema"
      ? callCinemaGoogleAppsScript
      : callGoogleAppsScript;
    const result = await syncAppsScript({
      appsScript,
      payload: {
        action: "payment_completed",
        orderId,
        stripeSessionId: session.id,
        paymentIntentId: sessionPaymentIntentId(session),
        amountTotal: session.amount_total || 0,
        customerEmail: session.customer_details?.email || session.customer_email || "",
        ...cinemaOrderPayloadFromSession(session),
      },
    });

    return response.status(200).json({
      ok: true,
      synced: true,
      duplicate: Boolean(result.duplicate),
      orderId,
    });
  } catch (error) {
    console.error("Checkout confirmation failed", {
      sessionId,
      message: error.message,
      status: error.status,
    });

    return response.status(502).json({
      ok: false,
      message: "De betaling is ontvangen, maar de bevestiging kon nog niet worden verwerkt.",
    });
  }
};
