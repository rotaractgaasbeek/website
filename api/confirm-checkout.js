const {
  callGoogleAppsScript,
  callCinemaGoogleAppsScript,
} = require("./_lib/google-apps-script");

const wait = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const cleanSessionId = (value) => String(value || "").trim().slice(0, 120);
const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const blockedCinemaEmails = new Set(["lievemalfliet@telenet.be"]);
const blockedCinemaOrderIds = new Set(["CINEMA-20260815-133831-8D416E"]);

const isBlockedCinemaOrder = ({ email, orderId }) =>
  blockedCinemaEmails.has(normalizeKey(email)) ||
  blockedCinemaOrderIds.has(String(orderId || "").trim());

const sessionPaymentIntentId = (session) => {
  if (typeof session.payment_intent === "string") {
    return session.payment_intent;
  }

  return session.payment_intent?.id || "";
};

const isPaidSession = (session) =>
  session.payment_status === "paid" || session.payment_intent?.status === "succeeded";

const emptyCinemaQuantities = () => ({
  ratatouilleAdultQuantity: 0,
  ratatouilleChildQuantity: 0,
  ratatouilleGiftQuantity: 0,
  orientAdultQuantity: 0,
  orientChildQuantity: 0,
  orientGiftQuantity: 0,
});

const cinemaQuantitiesFromLineItems = (lineItems) => {
  const quantities = emptyCinemaQuantities();

  lineItems.forEach((item) => {
    const description = String(item.description || "").toLowerCase();
    const quantity = Number.parseInt(item.quantity, 10) || 0;

    if (description.includes("ratatouille") && description.includes("13+")) {
      quantities.ratatouilleAdultQuantity += quantity;
    } else if (description.includes("ratatouille") && description.includes("schenkticket")) {
      quantities.ratatouilleGiftQuantity += quantity;
    } else if (description.includes("ratatouille")) {
      quantities.ratatouilleChildQuantity += quantity;
    } else if (description.includes("orient express") && description.includes("13+")) {
      quantities.orientAdultQuantity += quantity;
    } else if (description.includes("orient express") && description.includes("schenkticket")) {
      quantities.orientGiftQuantity += quantity;
    } else if (description.includes("orient express")) {
      quantities.orientChildQuantity += quantity;
    }
  });

  return quantities;
};

const hasCinemaLineItems = (lineItems) =>
  lineItems.some((item) => {
    const description = String(item.description || "").toLowerCase();
    return description.includes("ratatouille") || description.includes("orient express");
  });

const cinemaOrderPayloadFromSession = (session, lineItems) => {
  const metadata = session.metadata || {};

  if (metadata.event !== "cinema" && !hasCinemaLineItems(lineItems)) {
    return {};
  }

  const lineItemQuantities = cinemaQuantitiesFromLineItems(lineItems);

  return {
    event: "Openluchtcinema 2026",
    name: metadata.name || session.customer_details?.name || "",
    email:
      metadata.email ||
      session.customer_details?.email ||
      session.customer_email ||
      "",
    phone: metadata.phone || session.customer_details?.phone || "",
    ratatouilleAdultQuantity:
      metadata.ratatouilleAdultQuantity || lineItemQuantities.ratatouilleAdultQuantity,
    ratatouilleChildQuantity:
      metadata.ratatouilleChildQuantity || lineItemQuantities.ratatouilleChildQuantity,
    ratatouilleGiftQuantity:
      metadata.ratatouilleGiftQuantity || lineItemQuantities.ratatouilleGiftQuantity,
    orientAdultQuantity:
      metadata.orientAdultQuantity || lineItemQuantities.orientAdultQuantity,
    orientChildQuantity:
      metadata.orientChildQuantity || lineItemQuantities.orientChildQuantity,
    orientGiftQuantity:
      metadata.orientGiftQuantity || lineItemQuantities.orientGiftQuantity,
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

const fetchStripeLineItems = async (sessionId) => {
  const params = new URLSearchParams({ limit: "100" });
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    },
  );
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error?.message || "Stripe-ticketgegevens konden niet worden gecontroleerd.");
  }

  return Array.isArray(result.data) ? result.data : [];
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
  const forceResend =
    body.forceResend === true ||
    body.resend === true ||
    body.force === true;

  if (!sessionId.startsWith("cs_")) {
    return response.status(400).json({ ok: false, message: "Ongeldige betaalreferentie." });
  }

  let diagnostic = {};

  try {
    const session = await fetchStripeSession(sessionId);
    const lineItems = await fetchStripeLineItems(sessionId);
    const metadata = session.metadata || {};
    const eventType = metadata.event || (hasCinemaLineItems(lineItems) ? "cinema" : "");
    const orderId = metadata.order_id || session.client_reference_id;
    const cinemaPayload = cinemaOrderPayloadFromSession(session, lineItems);

    diagnostic = {
      eventType,
      orderId,
      paymentStatus: session.payment_status || "",
      paymentIntentStatus: session.payment_intent?.status || "",
      lineItems: lineItems.map((item) => ({
        description: item.description || "",
        quantity: item.quantity || 0,
      })),
      cinemaQuantities: {
        ratatouilleAdultQuantity: cinemaPayload.ratatouilleAdultQuantity || 0,
        ratatouilleChildQuantity: cinemaPayload.ratatouilleChildQuantity || 0,
        ratatouilleGiftQuantity: cinemaPayload.ratatouilleGiftQuantity || 0,
        orientAdultQuantity: cinemaPayload.orientAdultQuantity || 0,
        orientChildQuantity: cinemaPayload.orientChildQuantity || 0,
        orientGiftQuantity: cinemaPayload.orientGiftQuantity || 0,
      },
      hasName: Boolean(cinemaPayload.name),
      hasEmail: Boolean(cinemaPayload.email),
    };

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

    if (
      eventType === "cinema" &&
      isBlockedCinemaOrder({ email: cinemaPayload.email, orderId })
    ) {
      return response.status(200).json({
        ok: true,
        synced: false,
        blocked: true,
        orderId,
        diagnostic,
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
        forceResend: eventType === "cinema" ? forceResend : false,
        ...cinemaPayload,
      },
    });

    return response.status(200).json({
      ok: true,
      synced: !result.manualProcessing && !result.blocked,
      duplicate: Boolean(result.duplicate),
      resent: Boolean(result.resent),
      manualProcessing: Boolean(result.manualProcessing),
      blocked: Boolean(result.blocked),
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
      detail: error.message || "",
      status: error.status || null,
      diagnostic,
    });
  }
};
