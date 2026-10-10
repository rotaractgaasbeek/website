const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contact = require('../api/contact');

const sample = {
  name: 'Test Bezoeker', email: 'test@example.com', topic: 'lid-worden',
  subject: 'Lid worden',
  message: 'Ik wil graag vrijblijvend kennismaken met de club.', website: '',
};

function response() {
  const headers = new Map();
  let body;
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value) { body = value; },
    result() { return { status: this.statusCode, body: body && JSON.parse(body), headers }; },
  };
}

function request(body = sample, method = 'POST') {
  return {
    method,
    url: '/api/contact',
    headers: { host: 'rotaractgaasbeek.be', origin: 'https://rotaractgaasbeek.be', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function withConfig(run) {
  const oldUrl = process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
  const oldSecret = process.env.CONTACT_FORM_SECRET;
  process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test-id/exec';
  process.env.CONTACT_FORM_SECRET = 'a-secret-longer-than-24-characters';
  return Promise.resolve().then(run).finally(() => {
    if (oldUrl === undefined) delete process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
    else process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.CONTACT_FORM_SECRET;
    else process.env.CONTACT_FORM_SECRET = oldSecret;
  });
}

test('the familiar contact form requires a message and accepts a membership subject', () => {
  assert.deepEqual(contact.validateContact(sample), {
    name: sample.name, email: sample.email, topic: 'lid-worden',
    subject: sample.subject, message: sample.message,
  });
  assert.equal(contact.validateContact({ ...sample, message: '' }), null);
  assert.equal(contact.validateContact({ ...sample, topic: 'algemene-vraag', message: '' }), null);
  assert.equal(contact.validateContact({ ...sample, topic: 'other' }), null);
  assert.equal(contact.validateContact({ ...sample, email: 'not-an-email' }), null);
  assert.equal(contact.validateContact({ ...sample, subject: 'x'.repeat(121) }), null);
  assert.equal(contact.validateContact({ ...sample, subject: ' ' }).subject, 'Vraag via website');
  assert.deepEqual(contact.validateContact({ ...sample, website: 'spam.example' }), { honeypot: true });
});

test('membership buttons open the familiar form without an extra navigation item', () => {
  const page = fs.readFileSync(path.join(__dirname, '../contact.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../assets/js/main.js'), 'utf8');
  const home = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const about = fs.readFileSync(path.join(__dirname, '../over-ons.html'), 'utf8');
  for (const field of ['name', 'email', 'subject', 'message']) {
    assert.match(page, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(page, /<select[^>]*name="topic"/);
  assert.doesNotMatch(page, /nav__link[^\n]*>Lid worden<\/a>/);
  assert.match(script, /subject\.value = "Lid worden"/);
  for (const source of [home, about]) {
    assert.match(source, /href="contact\.html\?onderwerp=lid-worden#contactformulier"/);
    assert.doesNotMatch(source, /nav__link[^\n]*>Lid worden<\/a>/);
  }
});

test('the form is unavailable until the private Google connection is configured', async () => {
  const oldUrl = process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
  const oldSecret = process.env.CONTACT_FORM_SECRET;
  delete process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
  delete process.env.CONTACT_FORM_SECRET;
  try {
    const status = response();
    await contact({ method: 'GET', url: '/api/contact?status=1' }, status);
    assert.deepEqual(status.result().body, { available: false });
    const sent = response();
    await contact(request(), sent);
    assert.equal(sent.result().status, 503);
  } finally {
    if (oldUrl === undefined) delete process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL;
    else process.env.CONTACT_GOOGLE_APPS_SCRIPT_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.CONTACT_FORM_SECRET;
    else process.env.CONTACT_FORM_SECRET = oldSecret;
  }
});

test('the website proxy validates requests and sends only valid messages through Google', async () => withConfig(async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  try {
    const status = response();
    await contact({ method: 'GET', url: '/api/contact?status' }, status);
    assert.deepEqual(status.result().body, { available: true });

    const badOrigin = response();
    await contact({ ...request(), headers: { ...request().headers, origin: 'https://evil.example' } }, badOrigin);
    assert.equal(badOrigin.result().status, 403);
    const invalid = response();
    await contact(request({ ...sample, name: 'X' }), invalid);
    assert.equal(invalid.result().status, 400);
    const bot = response();
    await contact(request({ ...sample, website: 'bot.example' }), bot);
    assert.equal(bot.result().status, 200);
    assert.equal(calls.length, 0);

    const valid = response();
    await contact(request(), valid);
    assert.deepEqual(valid.result().body, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://script.google.com/macros/s/test-id/exec');
    const forwarded = JSON.parse(calls[0].options.body);
    assert.equal(forwarded.secret, process.env.CONTACT_FORM_SECRET);
    assert.equal(forwarded.action, 'contact');
    assert.equal(forwarded.topic, 'lid-worden');
    assert.equal(forwarded.subject, sample.subject);
  } finally {
    global.fetch = originalFetch;
  }
}));

test('the website never claims success when Google did not send the mail', async () => withConfig(async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ ok: false, message: 'Mail failed' }) });
  try {
    const result = response();
    await contact(request(), result);
    assert.equal(result.result().status, 502);
    assert.equal(result.result().body.ok, false);
  } finally {
    global.fetch = originalFetch;
  }
}));

test('Apps Script sends a club mail with the visitor as reply-to, but only with the secret', () => {
  const source = fs.readFileSync(path.join(__dirname, '../apps-script/ContactService.gs'), 'utf8');
  const mails = [];
  const properties = new Map([['CONTACT_FORM_SECRET', 'safe-secret']]);
  const context = vm.createContext({
    console: { error() {} },
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value),
    }) },
    Utilities: { getUuid: () => 'uuid' },
    MailApp: { getRemainingDailyQuota: () => 100, sendEmail: mail => mails.push(mail) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(source, context);
  const post = payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) } }).text);
  assert.equal(post({ ...sample, secret: 'wrong', action: 'contact' }).ok, false);
  assert.equal(mails.length, 0);
  assert.equal(post({ ...sample, secret: 'safe-secret', action: 'contact' }).ok, true);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'info@rotaractgaasbeek.be');
  assert.equal(mails[0].replyTo, 'test@example.com');
  assert.match(mails[0].subject, /Mogelijk toekomstig lid/);
  assert.match(mails[0].subject, /Lid worden/);
  assert.match(mails[0].body, /vrijblijvend kennismaken/);
});
