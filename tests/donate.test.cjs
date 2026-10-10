const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const donate = require('../api/donate');

function call(method = 'GET', url = '/api/donate') {
  const headers = new Map();
  let body;
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value) { body = value; },
  };
  donate({ method, url }, response);
  return { status: response.statusCode, headers, body };
}

test('only genuine HTTPS Stripe donation links are accepted', () => {
  assert.equal(donate.getDonationLink(' https://donate.stripe.com/test_123 '), 'https://donate.stripe.com/test_123');
  assert.equal(donate.getDonationLink('https://buy.stripe.com/test_123'), 'https://buy.stripe.com/test_123');
  for (const value of [
    'http://donate.stripe.com/test_123',
    'https://donate.stripe.com.evil.example/test_123',
    'https://user@donate.stripe.com/test_123',
    'https://stripe.com/test_123',
    'https://buy.stripe.com/',
    'javascript:alert(1)',
  ]) assert.equal(donate.getDonationLink(value), null);
});

test('donations stay unavailable until a valid link is configured', () => {
  const old = process.env.STRIPE_DONATION_LINK;
  delete process.env.STRIPE_DONATION_LINK;
  try {
    const status = call('GET', '/api/donate?status=1');
    assert.equal(status.status, 200);
    assert.deepEqual(JSON.parse(status.body), { available: false });
    const page = call();
    assert.equal(page.status, 503);
    assert.match(page.body, /Online doneren is nog niet beschikbaar/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
  } finally {
    if (old === undefined) delete process.env.STRIPE_DONATION_LINK;
    else process.env.STRIPE_DONATION_LINK = old;
  }
});

test('a configured donation link becomes available and redirects to Stripe', () => {
  const old = process.env.STRIPE_DONATION_LINK;
  process.env.STRIPE_DONATION_LINK = 'https://donate.stripe.com/test_123';
  try {
    assert.deepEqual(JSON.parse(call('GET', '/api/donate?status').body), { available: true });
    const result = call();
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('location'), 'https://donate.stripe.com/test_123');
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(call('HEAD').body, undefined);
    assert.equal(call('POST').status, 405);
  } finally {
    if (old === undefined) delete process.env.STRIPE_DONATION_LINK;
    else process.env.STRIPE_DONATION_LINK = old;
  }
});

test('the donation button is visible immediately and the unavailable message starts hidden', () => {
  const impact = fs.readFileSync(path.join(__dirname, '../impact.html'), 'utf8');
  assert.match(impact, /href="\/api\/donate" data-donation-link>Doneer een bedrag naar keuze<\/a>/);
  assert.match(impact, /data-donation-pending role="status" hidden>/);
  assert.doesNotMatch(impact, /Na activatie verloopt de betaling/);
});
