const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const bootstrapSource = fs.readFileSync(path.join(root, 'assets/js/google-tag-bootstrap.js'), 'utf8');
const consentSource = fs.readFileSync(path.join(root, 'assets/js/google-consent.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
const contactSource = mainSource.slice(
  mainSource.indexOf('const contactForm = document.querySelector("[data-contact-form]");'),
  mainSource.indexOf('const interestForm = document.querySelector("[data-interest-form]");'),
);

function consentPage(label = '') {
  const controls = new Map();
  const appendedScripts = [];
  const storage = new Map();
  const footer = { append() {} };
  const banner = {
    hidden: false,
    setAttribute() {},
    querySelector(selector) { return controls.get(selector); },
  };
  for (const selector of ['[data-cookie-close]', '[data-cookie-deny]', '[data-cookie-allow]']) {
    controls.set(selector, { hidden: false, addEventListener(_, callback) { this.click = callback; }, focus() {} });
  }
  const document = {
    querySelector(selector) {
      if (selector === '.site-footer .footer-links:last-child') return footer;
      if (selector === 'script[data-rotaract-google-ads]') return appendedScripts[0] || null;
      return null;
    },
    createElement(tag) {
      if (tag === 'section') return banner;
      return { dataset: {}, classList: { add() {} }, addEventListener() {}, focus() {} };
    },
    head: { append(script) { appendedScripts.push(script); } },
    body: { append() {} },
  };
  const window = { location: { reload() {} } };
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); },
  };
  const script = consentSource.replace(/const contactConversionLabel = "[^"]*";/, `const contactConversionLabel = "${label}";`);
  const context = vm.createContext({ document, window, localStorage, Date });
  vm.runInContext(bootstrapSource, context);
  vm.runInContext(script, context);
  return { window, controls, appendedScripts, banner };
}

test('Google Ads is not loaded without a choice or after refusal, and conversion needs consent', () => {
  const page = consentPage('TEST_LABEL');
  assert.equal(page.banner.hidden, false);
  assert.equal(page.appendedScripts.length, 0);
  assert.equal(page.window.dataLayer[0][0], 'consent');
  assert.equal(page.window.dataLayer[0][1], 'default');
  for (const value of Object.values(page.window.dataLayer[0][2])) assert.equal(value, 'denied');
  page.window.rotaractTrackContactConversion();
  assert.equal(page.appendedScripts.length, 0);
  page.controls.get('[data-cookie-deny]').click();
  page.window.rotaractTrackContactConversion();
  assert.equal(page.appendedScripts.length, 0);
});

test('only a configured conversion label can send a conversion after consent', () => {
  const missingLabel = consentPage();
  missingLabel.controls.get('[data-cookie-allow]').click();
  missingLabel.window.rotaractTrackContactConversion();
  assert.equal(missingLabel.appendedScripts.length, 1);
  assert.equal(missingLabel.window.dataLayer.filter(item => item[0] === 'event').length, 0);

  const configured = consentPage('TEST_LABEL');
  configured.controls.get('[data-cookie-allow]').click();
  configured.window.rotaractTrackContactConversion();
  assert.equal(configured.appendedScripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=AW-18456720108');
  assert.deepEqual(Array.from(configured.window.dataLayer, item => item[0]), ['consent', 'js', 'consent', 'config', 'event']);
  const events = configured.window.dataLayer.filter(item => item[0] === 'event');
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'conversion');
  assert.equal(events[0][2].send_to, 'AW-18456720108/TEST_LABEL');
  assert.deepEqual(Object.keys(events[0][2]), ['send_to']);
});

test('the production contact conversion uses the label from Google Ads', () => {
  assert.match(consentSource, /const contactConversionLabel = "IB_UCILo3pgdEOzl7OBE";/);
});

async function submitContact({ valid = true, responseOk = true, delivered = true, requestFails = false } = {}) {
  const sent = [];
  let submit;
  let submitEnabled = false;
  const fields = {
    '[data-contact-topic]': { value: 'algemene-vraag' },
    '[data-contact-subject]': { value: '' },
    '[data-contact-message]': { value: '' },
    '[data-contact-status]': { textContent: '', classList: { add() {}, remove() {} } },
    'button[type="submit"]': { textContent: '', get disabled() { return !submitEnabled; }, set disabled(value) { submitEnabled = !value; } },
  };
  const form = {
    action: '/api/contact',
    querySelector(selector) { return fields[selector]; },
    addEventListener(_, callback) { submit = callback; },
    reportValidity() { return valid; },
    reset() {},
  };
  const window = {
    location: { search: '' },
    rotaractTrackContactConversion() { sent.push('conversion'); },
  };
  const fetch = async (url) => {
    if (url.endsWith('?status=1')) return { ok: true, json: async () => ({ available: true }) };
    if (requestFails) throw new Error('Mail kon niet worden verzonden.');
    return { ok: responseOk, json: async () => ({ ok: responseOk, delivered }) };
  };
  const context = { window, fetch, URLSearchParams, FormData: class { entries() { return []; } }, document: { querySelector: () => form } };
  vm.runInNewContext(contactSource, context);
  await new Promise(resolve => setImmediate(resolve));
  await submit({ preventDefault() {} });
  return { sent, status: fields['[data-contact-status]'].textContent };
}

test('a contact conversion follows only a valid, genuinely delivered form', async () => {
  assert.equal((await submitContact({ valid: false })).sent.length, 0);
  assert.equal((await submitContact({ responseOk: false })).sent.length, 0);
  assert.equal((await submitContact({ delivered: false })).sent.length, 0);
  assert.equal((await submitContact({ requestFails: true })).sent.length, 0);
  const success = await submitContact();
  assert.equal(success.sent.length, 1);
  assert.match(success.status, /naar de club verstuurd/);
});

test('each website page offers the same consent-controlled Google Ads loader', () => {
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<script src="assets\/js\/google-tag-bootstrap\.js"><\/script>\s*<script defer src="assets\/js\/google-consent\.js"><\/script>/, page);
  }
});
