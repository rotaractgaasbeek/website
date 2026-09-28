const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const parseBody = body => {
  if (typeof body !== 'string') return body && typeof body === 'object' ? body : {};
  try { return JSON.parse(body) || {}; } catch { return {}; }
};

function normalize(body, booking) {
  const payload = {
    street: clean(body.street, 160), houseNumber: clean(body.houseNumber, 20),
    postalCode: clean(body.postalCode, 4), city: clean(body.city, 100),
    trip: clean(body.trip, 30),
  };
  if (booking) Object.assign(payload, {
    name: clean(body.name, 120), email: clean(body.email, 180), phone: clean(body.phone, 40),
    passengers: Number(body.passengers), notes: clean(body.notes, 1500),
    consent: body.consent === 'yes', requestId: clean(body.requestId, 36),
    quoteToken: clean(body.quoteToken, 36),
  });
  return payload;
}

function validate(data, booking) {
  if (!data.street || !data.houseNumber || !/^\d{4}$/.test(data.postalCode) || !data.city) return 'Vul je volledige Belgische adres in, inclusief huisnummer en postcode.';
  if (!['round-trip', 'outbound', 'home', 'home-morning'].includes(data.trip)) return 'Kies welke ritten je wilt boeken.';
  if (!booking) return '';
  if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || (data.phone.match(/\d/g) || []).length < 7) return 'Controleer je naam, e-mailadres en telefoonnummer.';
  if (!Number.isInteger(data.passengers) || data.passengers < 1 || data.passengers > 50) return 'Vul een geldig aantal personen in (1 tot 50).';
  if (!data.consent) return 'Bevestig dat je je definitief wilt inschrijven en de tarieven hebt gelezen.';
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data.requestId)) return 'Herlaad de pagina om je boeking te starten.';
  return '';
}

function taxiHandler(action) {
  const booking = action === 'taxi_booking';
  return async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return response.status(405).json({ ok: false, message: 'Methode niet toegestaan.' });
    }
    const body = parseBody(request.body);
    if (body.website) return response.status(400).json({ ok: false, message: 'Ongeldige aanvraag.' });
    const data = normalize(body, booking);
    const error = validate(data, booking);
    if (error) return response.status(400).json({ ok: false, message: error });
    const url = process.env.TAXI_GOOGLE_APPS_SCRIPT_URL;
    const secret = process.env.TAXI_FORM_SECRET;
    if (!url || !secret) return response.status(503).json({
      ok: false, message: booking
        ? 'Online boeken is tijdelijk niet beschikbaar. Mail je boeking naar info@rotaractgaasbeek.be.'
        : 'De automatische prijsraming is tijdelijk niet beschikbaar.',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const upstream = await fetch(url, {
        method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, action, secret }), signal: controller.signal,
      });
      const result = await upstream.json().catch(() => ({}));
      // An old interest deployment must never look like a successful booking.
      if (!upstream.ok || result.version !== 'taxi-booking-v1') return response.status(503).json({
        ok: false, message: 'De taxidienst wordt bijgewerkt. Probeer later opnieuw of mail info@rotaractgaasbeek.be.',
      });
      if (!result.ok) return response.status(result.code === 'INVALID_INPUT' ? 400 : 502).json({ ok: false, message: result.message || 'De aanvraag kon niet worden verwerkt.' });
      if ((booking && !result.id) || (!booking && !result.quote)) throw new Error('Invalid response');
      return response.status(200).json(booking
        ? { ok: true, id: result.id, emailSent: result.emailSent === true, estimatePending: result.estimatePending, sameDay: result.sameDay }
        : { ok: true, quote: result.quote });
    } catch {
      // Never log addresses, e-mail addresses, secrets or upstream response bodies.
      return response.status(502).json({ ok: false, message: booking
        ? 'We konden de ontvangst nog niet bevestigen. Probeer opnieuw met hetzelfde formulier; je boeking wordt niet dubbel opgeslagen.'
        : 'De rijafstand kon niet worden berekend. Controleer je adres of probeer later opnieuw.',
      });
    } finally { clearTimeout(timer); }
  };
}

module.exports = { taxiHandler, normalize, validate };
