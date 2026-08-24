const clean = (value, maxLength = 500) =>
  String(value || "").trim().slice(0, maxLength);

const parseBody = (body) => {
  if (typeof body !== "string") {
    return body || {};
  }

  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
};

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, message: "Methode niet toegestaan." });
  }

  const webAppUrl = process.env.TAXI_GOOGLE_APPS_SCRIPT_URL;
  const formSecret = process.env.TAXI_FORM_SECRET;

  if (!webAppUrl || !formSecret) {
    return response.status(503).json({
      ok: false,
      message: "Het interesseformulier is nog niet volledig geconfigureerd.",
    });
  }

  const body = parseBody(request.body);

  if (clean(body.website)) {
    return response.status(200).json({ ok: true });
  }

  const interest = {
    name: clean(body.name, 120),
    email: clean(body.email, 180),
    phone: clean(body.phone, 80),
  };

  if (
    !interest.name ||
    !interest.phone ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interest.email)
  ) {
    return response.status(400).json({
      ok: false,
      message: "Controleer je naam, telefoonnummer en e-mailadres.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const googleResponse = await fetch(webAppUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: formSecret,
        action: "taxi_interest",
        ...interest,
      }),
      signal: controller.signal,
    });

    const result = await googleResponse.json().catch(() => ({}));

    if (!googleResponse.ok || !result.ok) {
      console.error("Google Apps Script error", googleResponse.status, result);
      return response.status(502).json({
        ok: false,
        message:
          result.message ||
          "Je interesse kon niet worden opgeslagen. Probeer later opnieuw.",
      });
    }

    return response.status(200).json({
      ok: true,
      id: result.id,
      emailSent: result.emailSent,
    });
  } catch (error) {
    console.error("Google Apps Script request failed", error);
    return response.status(502).json({
      ok: false,
      message: "Je interesse kon niet worden opgeslagen. Probeer later opnieuw.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
