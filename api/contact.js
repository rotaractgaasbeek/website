const { callAppsScript } = require('./_lib/google-apps-script');

const TOPICS = new Set(['lid-worden', 'algemene-vraag', 'samenwerking', 'event']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const topic = clean(body.topic);
  const subject = clean(body.subject) || 'Vraag via website';
  const message = clean(body.message);
  const website = clean(body.website);

  if (website) return { honeypot: true };
  if (name.length < 2 || name.length > 100 || !EMAIL.test(email) || email.length > 254 ||
      !TOPICS.has(topic) || subject.length > 120 || message.length > 5000 || !message) {
    return null;
  }
  return { name, email, topic, subject: subject.replace(/[\r\n]+/g, ' '), message };
}

function configured() {
  const url = process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
  const secret = process.env.CONTACT_FORM_SECRET;
  return Boolean(secret && secret.length >= 24 &&
    /^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(url || ''));
}

function json(response, status, data) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.end(JSON.stringify(data));
}

async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method === 'GET' && new URL(request.url, 'http://localhost').searchParams.has('status')) {
    return json(response, 200, { available: configured() });
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, GET');
    return json(response, 405, { ok: false, message: 'Methode niet toegestaan.' });
  }

  const origin = request.headers?.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        return json(response, 403, { ok: false, message: 'Deze aanvraag is niet toegestaan.' });
      }
    } catch {
      return json(response, 403, { ok: false, message: 'Deze aanvraag is niet toegestaan.' });
    }
  }
  if (!request.headers?.['content-type']?.toLowerCase().startsWith('application/json')) {
    return json(response, 415, { ok: false, message: 'Ongeldig formulierformaat.' });
  }
  if (!configured()) {
    return json(response, 503, { ok: false, message: 'Het contactformulier is nog niet actief. Mail ons voorlopig op info@rotaractgaasbeek.be.' });
  }

  let body;
  try {
    if (typeof request.body === 'string') {
      if (Buffer.byteLength(request.body, 'utf8') > 12000) throw new Error('te groot');
      body = JSON.parse(request.body);
    } else {
      if (Buffer.byteLength(JSON.stringify(request.body || {}), 'utf8') > 12000) throw new Error('te groot');
      body = request.body;
    }
  } catch {
    return json(response, 400, { ok: false, message: 'Controleer je gegevens en probeer opnieuw.' });
  }
  const data = validateContact(body);
  if (!data) return json(response, 400, { ok: false, message: 'Controleer je naam, e-mailadres, onderwerp en bericht.' });
  if (data.honeypot) return json(response, 200, { ok: true, delivered: false });

  try {
    await callAppsScript(
      { action: 'contact', ...data },
      process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL,
      process.env.CONTACT_FORM_SECRET,
      { timeoutMs: 12000 },
    );
    return json(response, 200, { ok: true, delivered: true });
  } catch {
    return json(response, 502, { ok: false, message: 'Verzenden is nu niet gelukt. Probeer later opnieuw of mail ons rechtstreeks op info@rotaractgaasbeek.be.' });
  }
}

module.exports = handler;
module.exports.validateContact = validateContact;
module.exports.configured = configured;
