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

  const webAppUrl = process.env.GOOGLE_APPS_SCRIPT_URL;
  const formSecret = process.env.RALLY_FORM_SECRET;

  if (!webAppUrl || !formSecret) {
    return response.status(503).json({
      ok: false,
      message: "Het inschrijfformulier is nog niet volledig geconfigureerd.",
    });
  }

  const body = parseBody(request.body);

  if (clean(body.website)) {
    return response.status(200).json({ ok: true });
  }

  const registration = {
    name: clean(body.Naam, 120),
    email: clean(body.email, 180),
    phone: clean(body.Telefoonnummer, 80),
    participation: clean(body.Deelname, 120),
    car: clean(body.Wagen, 160),
    year: clean(body["Bouwjaar wagen"], 20),
    plate: clean(body["Nummerplaat wagen"], 40),
    people: clean(body["Aantal personen inclusief bestuurder"], 10),
    diet: clean(body["Allergieën of dieetwensen"], 500),
    remarks: clean(body.Opmerkingen, 2000),
    consent: clean(body["Akkoord gegevensverwerking"], 20),
  };

  const required = [
    registration.name,
    registration.email,
    registration.phone,
    registration.participation,
    registration.people,
    registration.consent,
  ];

  if (
    required.some((value) => !value) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email)
  ) {
    return response.status(400).json({
      ok: false,
      message: "Controleer de verplichte velden en probeer opnieuw.",
    });
  }

  if (
    registration.participation !== "Enkel BBQ" &&
    (!registration.car || !registration.year || !registration.plate)
  ) {
    return response.status(400).json({
      ok: false,
      message: "Vul de gegevens van de wagen volledig in.",
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
        ...registration,
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
          "De aanvraag kon niet worden opgeslagen. Probeer later opnieuw.",
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
      message: "De aanvraag kon niet worden opgeslagen. Probeer later opnieuw.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
