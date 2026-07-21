const {
  callGoogleAppsScript,
  callCinemaGoogleAppsScript,
} = require("./_lib/google-apps-script");

const SITE_URL = process.env.SITE_URL || "https://www.rotaractgaasbeek.be";
const BBQ_PRICE = 10000;
const CINEMA_ADULT_PRICE = 1600;
const CINEMA_CHILD_PRICE = 1200;
const CINEMA_GIFT_PRICE = 1200;
const PAYMENT_METHODS = {
  bancontact: "bancontact",
  ideal: "ideal",
  card: "card",
};

const clean = (value, maxLength = 180) =>
  String(value || "").trim().slice(0, maxLength);

const asQuantity = (value, max = 100) => {
  const quantity = Number.parseInt(value, 10);
  return Number.isInteger(quantity) && quantity >= 0 && quantity <= max
    ? quantity
    : 0;
};

const appendLineItem = (params, index, name, amount, quantity) => {
  params.set(`line_items[${index}][price_data][currency]`, "eur");
  params.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
  params.set(`line_items[${index}][price_data][product_data][name]`, name);
  params.set(`line_items[${index}][quantity]`, String(quantity));
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
  const eventType = clean(body.event, 30);
  const name = clean(body.name);
  const email = clean(body.email);
  const phone = clean(body.phone, 80);
  const paymentMethod = clean(body.paymentMethod, 30) || "bancontact";

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({
      ok: false,
      message: "Vul je naam en een geldig e-mailadres in.",
    });
  }

  if (eventType !== "bbq" && eventType !== "cinema") {
    return response.status(400).json({ ok: false, message: "Onbekend evenement." });
  }

  const stripePaymentMethod = PAYMENT_METHODS[paymentMethod];

  if (!stripePaymentMethod) {
    return response.status(400).json({
      ok: false,
      message: "Kies een geldige betaalmethode.",
    });
  }

  const order = eventType === "cinema"
    ? {
        event: "Openluchtcinema 2026",
        ratatouilleAdultQuantity: asQuantity(body.ratatouilleAdultQuantity, 500),
        ratatouilleChildQuantity: asQuantity(body.ratatouilleChildQuantity, 500),
        ratatouilleGiftQuantity: asQuantity(body.ratatouilleGiftQuantity, 500),
        orientAdultQuantity: asQuantity(body.orientAdultQuantity, 500),
        orientChildQuantity: asQuantity(body.orientChildQuantity, 500),
        orientGiftQuantity: asQuantity(body.orientGiftQuantity, 500),
      }
    : {
        event: "RAC GP - Enkel BBQ",
        bbqQuantity: asQuantity(body.bbqQuantity, 120),
      };

  const quantityFields = eventType === "cinema"
    ? [
        "ratatouilleAdultQuantity",
        "ratatouilleChildQuantity",
        "ratatouilleGiftQuantity",
        "orientAdultQuantity",
        "orientChildQuantity",
        "orientGiftQuantity",
      ]
    : ["bbqQuantity"];
  const totalQuantity = quantityFields.reduce(
    (total, field) => total + order[field],
    0,
  );

  if (totalQuantity < 1) {
    return response.status(400).json({
      ok: false,
      message: "Kies minstens één ticket.",
    });
  }

  let reservation;

  try {
    const appsScript = eventType === "cinema"
      ? callCinemaGoogleAppsScript
      : callGoogleAppsScript;

    reservation = await appsScript({
      action: "reserve_tickets",
      ...order,
      name,
      email,
      phone,
    });

    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${SITE_URL}/ticket-bedankt.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: eventType === "cinema"
        ? `${SITE_URL}/openluchtcinema.html?betaling=geannuleerd#tickets`
        : `${SITE_URL}/rally.html?betaling=geannuleerd#bbq-tickets`,
      customer_email: email,
      client_reference_id: reservation.orderId,
      "metadata[order_id]": reservation.orderId,
      "metadata[event]": eventType,
      "metadata[payment_method]": paymentMethod,
      "payment_method_types[0]": stripePaymentMethod,
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      locale: "nl",
    });

    let lineIndex = 0;
    if (order.bbqQuantity) {
      appendLineItem(params, lineIndex++, "RAC GP - BBQ", BBQ_PRICE, order.bbqQuantity);
    }
    if (order.ratatouilleAdultQuantity) {
      appendLineItem(params, lineIndex++, "Ratatouille - ticket 13+", CINEMA_ADULT_PRICE, order.ratatouilleAdultQuantity);
    }
    if (order.ratatouilleChildQuantity) {
      appendLineItem(params, lineIndex++, "Ratatouille - ticket t.e.m. 12 jaar", CINEMA_CHILD_PRICE, order.ratatouilleChildQuantity);
    }
    if (order.ratatouilleGiftQuantity) {
      appendLineItem(params, lineIndex++, "Ratatouille - schenkticket VZW De Poel", CINEMA_GIFT_PRICE, order.ratatouilleGiftQuantity);
    }
    if (order.orientAdultQuantity) {
      appendLineItem(params, lineIndex++, "Murder on the Orient Express - ticket 13+", CINEMA_ADULT_PRICE, order.orientAdultQuantity);
    }
    if (order.orientChildQuantity) {
      appendLineItem(params, lineIndex++, "Murder on the Orient Express - ticket t.e.m. 12 jaar", CINEMA_CHILD_PRICE, order.orientChildQuantity);
    }
    if (order.orientGiftQuantity) {
      appendLineItem(params, lineIndex++, "Murder on the Orient Express - schenkticket VZW De Poel", CINEMA_GIFT_PRICE, order.orientGiftQuantity);
    }
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const checkout = await stripeResponse.json().catch(() => ({}));

    if (!stripeResponse.ok || !checkout.url) {
      throw new Error(checkout.error?.message || "Stripe Checkout kon niet worden gestart.");
    }

    await appsScript({
      action: "attach_checkout",
      orderId: reservation.orderId,
      stripeSessionId: checkout.id,
    });

    return response.status(200).json({ ok: true, url: checkout.url });
  } catch (error) {
    if (reservation?.orderId) {
      const appsScript = eventType === "cinema"
        ? callCinemaGoogleAppsScript
        : callGoogleAppsScript;
      await appsScript({
        action: "release_reservation",
        orderId: reservation.orderId,
      }).catch(() => {});
    }

    console.error("Checkout creation failed", error);
    return response.status(400).json({
      ok: false,
      message: error.message || "De betaling kon niet worden gestart.",
    });
  }
};
