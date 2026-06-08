const { callGoogleAppsScript } = require("./_lib/google-apps-script");

const SITE_URL = process.env.SITE_URL || "https://www.rotaractgaasbeek.be";
const BBQ_PRICE = 10000;
const CINEMA_ADULT_PRICE = 1500;
const CINEMA_CHILD_PRICE = 1000;

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

  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({
      ok: false,
      message: "Vul je naam en een geldig e-mailadres in.",
    });
  }

  const order =
    eventType === "bbq"
      ? {
          event: "RAC GP - Enkel BBQ",
          bbqQuantity: asQuantity(body.bbqQuantity, 120),
          adultQuantity: 0,
          childQuantity: 0,
        }
      : {
          event: "Openluchtcinema",
          bbqQuantity: 0,
          adultQuantity: asQuantity(body.adultQuantity, 500),
          childQuantity: asQuantity(body.childQuantity, 500),
        };

  const totalQuantity =
    order.bbqQuantity + order.adultQuantity + order.childQuantity;

  if (
    (eventType !== "bbq" && eventType !== "cinema") ||
    totalQuantity < 1
  ) {
    return response.status(400).json({
      ok: false,
      message: "Kies minstens één ticket.",
    });
  }

  let reservation;

  try {
    reservation = await callGoogleAppsScript({
      action: "reserve_tickets",
      ...order,
      name,
      email,
      phone,
    });

    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${SITE_URL}/ticket-bedankt.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        eventType === "bbq"
          ? `${SITE_URL}/rally.html?betaling=geannuleerd#bbq-tickets`
          : `${SITE_URL}/openluchtcinema.html?betaling=geannuleerd#tickets`,
      customer_email: email,
      client_reference_id: reservation.orderId,
      "metadata[order_id]": reservation.orderId,
      "metadata[event]": eventType,
      "payment_method_types[0]": "bancontact",
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
      locale: "nl",
    });

    let lineIndex = 0;
    if (order.bbqQuantity) {
      appendLineItem(params, lineIndex++, "RAC GP - BBQ", BBQ_PRICE, order.bbqQuantity);
    }
    if (order.adultQuantity) {
      appendLineItem(
        params,
        lineIndex++,
        "Openluchtcinema - Volwassene",
        CINEMA_ADULT_PRICE,
        order.adultQuantity,
      );
    }
    if (order.childQuantity) {
      appendLineItem(
        params,
        lineIndex,
        "Openluchtcinema - Kind t.e.m. 12 jaar",
        CINEMA_CHILD_PRICE,
        order.childQuantity,
      );
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

    await callGoogleAppsScript({
      action: "attach_checkout",
      orderId: reservation.orderId,
      stripeSessionId: checkout.id,
    });

    return response.status(200).json({ ok: true, url: checkout.url });
  } catch (error) {
    if (reservation?.orderId) {
      await callGoogleAppsScript({
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
