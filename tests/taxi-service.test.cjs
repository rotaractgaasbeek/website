const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { taxiHandler, normalize, validate } = require('../api/_lib/taxi-service');

const input = (overrides = {}) => ({
  street: 'Teststraat', houseNumber: '12', postalCode: '1755', city: 'Gooik',
  name: 'Test Deelnemer', email: 'deelnemer@example.com', phone: '+32 470 00 00 00',
  passengers: '4', trip: 'round-trip', consent: 'yes',
  requestId: '12345678-1234-4234-8234-123456789abc', ...overrides,
});
const source = fs.readFileSync(path.join(__dirname, '../apps-script/TaxiService.gs'), 'utf8');

// All Google services are in-memory fakes. These tests never access accounts,
// real addresses, spreadsheets, or mail recipients.
function gas(options = {}) {
  const state = { rows: [], mails: [], calls: [], cache: new Map(), locked: false };
  const range = (row, column, rows = 1, columns = 1) => ({
    getValues: () => Array.from({ length: rows }, (_, r) =>
      Array.from({ length: columns }, (_, c) => state.rows[row - 1 + r]?.[column - 1 + c] ?? '')),
    setValues(values) {
      for (let r = 0; r < values.length; r++) {
        state.rows[row - 1 + r] ||= [];
        for (let c = 0; c < values[r].length; c++) state.rows[row - 1 + r][column - 1 + c] = values[r][c];
      }
      return this;
    },
    setValue(value) { return this.setValues([[value]]); },
    setBackground() { return this; }, setFontColor() { return this; }, setFontWeight() { return this; },
    createTextFinder(value) {
      return { matchEntireCell() { return this; }, findNext() {
        const index = state.rows.findIndex((values, i) => i >= row - 1 && i < row - 1 + rows && values[column - 1] === value);
        return index < 0 ? null : { getRow: () => index + 1 };
      } };
    },
  });
  const sheet = {
    getLastRow: () => state.rows.length, getRange: range,
    appendRow(row) {
      assert.ok(state.locked, 'Booking rows must be appended under lock');
      if (options.saveFailure) throw new Error('Test write failure');
      state.rows.push(row);
    },
    setFrozenRows() {}, autoResizeColumns() {},
  };
  const spreadsheet = { getSheetByName: () => sheet, insertSheet: () => sheet, getUrl: () => 'mock-sheet' };
  const properties = new Map([['FORM_SECRET', 'test-secret'], ['SPREADSHEET_ID', 'mock-sheet']]);
  const context = vm.createContext({
    console: { log() {}, error() {} },
    Maps: {
      DirectionFinder: { Mode: { DRIVING: 'driving' } },
      newDirectionFinder() {
        const call = {};
        return {
          setOrigin(value) { call.origin = value; return this; },
          setDestination(value) { call.destination = value; return this; },
          setMode(value) { call.mode = value; return this; },
          setLanguage() { return this; }, setRegion() { return this; },
          getDirections() {
            const index = state.calls.length;
            state.calls.push(call);
            if (options.mapsFailure) throw new Error('Test Maps unavailable');
            return {
              geocoded_waypoints: options.partial ? [{ partial_match: true }] : [{ geocoder_status: 'OK' }],
              routes: [{ legs: [{ start_address: call.origin, end_address: call.destination,
                distance: { value: options.distances?.[index] ?? 8000 } }] }],
            };
          },
        };
      },
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: () => options.date || '2026-09-28',
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (algorithm, value) => crypto.createHash(algorithm).update(value).digest(),
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
    },
    CacheService: { getScriptCache() {
      if (options.cacheFailure) throw new Error('Test cache unavailable');
      return { get: key => state.cache.get(key), put: (key, value) => state.cache.set(key, value) };
    } },
    SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock() { state.locked = true; }, releaseLock() { state.locked = false; } }) },
    MailApp: { sendEmail(mail) {
      if (mail.to === options.mailFailure) throw new Error('Test mail unavailable');
      state.mails.push(mail);
    } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(source, context);
  const booking = (overrides = {}) => context.normalizeTaxiBooking({ ...input(overrides), consent: true });
  const post = data => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text);
  return { context, state, booking, post };
}

test('fare: fixed per address through 5 km, only excess distance charged, cent rounding', () => {
  const { context } = gas();
  for (const [meters, cents] of [[0, 1000], [4999, 1000], [5000, 1000], [5001, 1000], [5010, 1002], [8000, 1600], [8125, 1625]]) {
    assert.equal(context.taxiFareCents(meters), cents, `${meters} m`);
  }
  for (const invalid of [-1, NaN, Infinity, '8000']) assert.throws(() => context.taxiFareCents(invalid));
});

test('round-trip calculates road distance separately in each direction, not per passenger', () => {
  const { context, state, booking } = gas({ distances: [8000, 9000, 8000, 9000] });
  const quote = context.createTaxiEstimate(booking());
  assert.equal(quote.totalCents, 3400);
  assert.equal(quote.legs.length, 2);
  assert.equal(state.calls[0].destination, 'Drie Egyptenbaan 11, 1755 Gooik, Belgium');
  assert.equal(state.calls[1].origin, state.calls[0].destination);
  assert.equal(state.calls[1].destination, state.calls[0].origin);
  assert.equal(state.calls[0].mode, 'driving');
  assert.equal(context.createTaxiEstimate(booking({ passengers: 1 })).totalCents, quote.totalCents);
});

test('morning car retrieval costs exactly the previous homeward fare', () => {
  const { context, state, booking } = gas({ distances: [8125] });
  const quote = context.createTaxiEstimate(booking({ trip: 'home-morning' }));
  assert.equal(quote.totalCents, 3250);
  assert.equal(quote.legs[0].cents, quote.legs[1].cents);
  assert.equal(state.calls.length, 1);
});

test('outbound and home options each calculate one leg', () => {
  for (const trip of ['outbound', 'home']) {
    const { context, state, booking } = gas();
    assert.equal(context.createTaxiEstimate(booking({ trip })).totalCents, 1600);
    assert.equal(state.calls.length, 1);
  }
});

test('inexact Google geocoding cannot produce a misleading quote', () => {
  const { context, booking } = gas({ partial: true });
  assert.throws(() => context.createTaxiEstimate(booking()), /Route unavailable/);
});

test('only a fresh cached quote for the exact route is reused', () => {
  const { context, state, booking } = gas();
  const data = booking();
  const quote = context.createTaxiEstimate(data);
  data.quoteToken = quote.token;
  assert.equal(context.getTaxiEstimate(data).token, quote.token);
  assert.equal(state.calls.length, 2);
  assert.notEqual(context.getTaxiEstimate({ ...data, houseNumber: '999' }).token, quote.token);
  quote.createdAt = Date.now() - 1800001;
  state.cache.set('taxi-quote:' + quote.token, JSON.stringify(quote));
  assert.notEqual(context.getTaxiEstimate(data).token, quote.token);
});

test('client amounts and fake quote tokens cannot set booking prices', () => {
  const { context, state, booking } = gas();
  const data = booking({ totalCents: 0, quoteToken: 'made-up' });
  context.saveTaxiBooking(data, 'mock-sheet');
  assert.equal(state.rows[1][21], 32);
});

test('cache outage does not prevent Maps estimates or bookings', () => {
  const { context, booking } = gas({ cacheFailure: true });
  assert.equal(context.getTaxiEstimate(booking({ quoteToken: 'missing' })).totalCents, 3200);
});

test('definitive booking is saved before both mails; retry does not duplicate anything', () => {
  const { context, state, booking } = gas();
  const data = booking();
  const result = context.saveTaxiBooking(data, 'mock-sheet');
  assert.ok(result.ok && result.emailSent);
  assert.equal(state.rows.length, 2);
  assert.equal(state.mails.length, 2);
  assert.equal(state.rows[1][25], 'Verstuurd');
  assert.equal(state.rows[1][26], 'Verstuurd');
  assert.match(state.mails[0].body, /definitieve inschrijving/);
  assert.match(state.mails[0].body, /schatting, geen vaste eindprijs/);
  assert.equal(state.mails[0].replyTo, 'info@rotaractgaasbeek.be');
  assert.equal(context.saveTaxiBooking({ ...data, quoteToken: 'new-token' }, 'mock-sheet').id, result.id);
  assert.equal(state.rows.length, 2);
  assert.equal(state.mails.length, 2);
  assert.equal(state.locked, false);
});

test('same request ID cannot silently overwrite an existing booking', () => {
  const { context, state, booking } = gas();
  context.saveTaxiBooking(booking(), 'mock-sheet');
  const result = context.saveTaxiBooking(booking({ passengers: '5' }), 'mock-sheet');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(state.rows.length, 2);
});

test('Maps failure still saves the booking and sends a price-pending receipt', () => {
  const { context, state, booking } = gas({ mapsFailure: true });
  const result = context.saveTaxiBooking(booking(), 'mock-sheet');
  assert.equal(result.ok, true);
  assert.equal(result.estimatePending, true);
  assert.equal(state.rows[1][21], '');
  assert.match(state.mails[0].body, /geen automatische prijsraming/);
});

test('participant mail failure preserves booking and still notifies organization', () => {
  const { context, state, booking } = gas({ mailFailure: 'deelnemer@example.com' });
  const result = context.saveTaxiBooking(booking(), 'mock-sheet');
  assert.equal(result.ok, true);
  assert.equal(result.emailSent, false);
  assert.equal(state.rows[1][25], 'Niet verstuurd — handmatig opvolgen');
  assert.equal(state.mails[0].to, 'info@rotaractgaasbeek.be');
});

test('organizer mail failure does not falsely report participant mail failure', () => {
  const { context, state, booking } = gas({ mailFailure: 'info@rotaractgaasbeek.be' });
  assert.equal(context.saveTaxiBooking(booking(), 'mock-sheet').emailSent, true);
  assert.equal(state.rows[1][26], 'Niet verstuurd — handmatig opvolgen');
});

test('failed storage never sends confirmation mail and releases the lock', () => {
  const { context, state, booking } = gas({ saveFailure: true });
  assert.throws(() => context.saveTaxiBooking(booking(), 'mock-sheet'));
  assert.equal(state.mails.length, 0);
  assert.equal(state.locked, false);
});

test('user values are spreadsheet-formula safe and HTML escaped', () => {
  const { context, state, booking } = gas();
  context.saveTaxiBooking(booking({ name: '=IMPORTXML("bad")', notes: '<img src=x onerror=alert(1)>' }), 'mock-sheet');
  assert.ok(state.rows[1][4].startsWith("'="));
  assert.ok(state.rows[1][6].startsWith("'+32"));
  assert.doesNotMatch(state.mails[0].htmlBody, /<img/);
  assert.match(state.mails[0].htmlBody, /&lt;img/);
});

test('Brussels event-day bookings have a surcharge and no prebooking priority', () => {
  const { context, state, booking } = gas({ date: '2026-11-20' });
  assert.equal(context.saveTaxiBooking(booking(), 'mock-sheet').sameDay, true);
  assert.equal(state.rows[1][23], 'Nee');
  assert.match(state.mails[0].body, /toeslag vóór vertrek/);
});

test('bookings close after the event but existing retries remain readable', () => {
  const { context, state, booking } = gas({ date: '2026-11-22' });
  assert.equal(context.saveTaxiBooking(booking(), 'mock-sheet').ok, false);
  assert.equal(state.mails.length, 0);
});

test('proxy and Apps Script reject missing contact/address/consent and invalid trip', () => {
  const { context } = gas();
  for (const change of [{ street: '' }, { postalCode: 'ABC' }, { email: 'invalid' }, { passengers: 0 }, { passengers: 2.5 },
    { phone: 'short' }, { requestId: 'invalid' }, { trip: 'other' }]) {
    const data = normalize(input(change), true);
    assert.ok(validate(data, true), JSON.stringify(change));
    assert.ok(context.validateTaxiBooking(context.normalizeTaxiBooking(data), true), JSON.stringify(change));
  }
  assert.ok(validate(normalize(input({ consent: '' }), true), true));
});

test('every trip can be booked without pickup times; obsolete times are ignored', () => {
  for (const trip of ['round-trip', 'outbound', 'home', 'home-morning']) {
    const { context, state } = gas();
    const data = normalize(input({ trip }), true);
    assert.equal(validate(data, true), '');
    const booking = context.normalizeTaxiBooking(data);
    assert.equal(context.validateTaxiBooking(booking, true), '');
    assert.equal(context.saveTaxiBooking(booking, 'mock-sheet').ok, true);
    assert.equal(state.rows[1][13], '');
    assert.equal(state.rows[1][15], '');
    assert.doesNotMatch(state.mails[0].body, /Gewenst ophaaluur/);
    if (trip === 'home-morning') assert.match(state.mails[0].body, /Ochtendrit naar je wagen op 21 november: Geboekt/);
    const oldInput = input({ trip, pickupTime: '18:00', morningTime: '09:00' });
    for (const normalized of [normalize(oldInput, true), context.normalizeTaxiBooking(oldInput)]) {
      assert.equal(normalized.pickupTime, undefined);
      assert.equal(normalized.morningTime, undefined);
    }
  }
});

test('taxi page has two rate cards, no price example and no pickup-time fields', () => {
  const page = fs.readFileSync(path.join(__dirname, '../taxi-service.html'), 'utf8');
  assert.equal((page.match(/class="taxi-rate"/g) || []).length, 2);
  assert.match(page, /grid--2 taxi-rates/);
  assert.doesNotMatch(page, /Een rit van 8 km|name="(?:pickupTime|morningTime)"|type="time"/);
});

test('booking consent is short, required and linked to four readable agreements', () => {
  const page = fs.readFileSync(path.join(__dirname, '../taxi-service.html'), 'utf8');
  assert.match(page, /name="consent"[^>]*required[^>]*aria-describedby="taxi-booking-terms"/);
  assert.match(page, /Ik schrijf mijn groep definitief in en ga akkoord met deze afspraken\./);
  const terms = page.match(/<ul id="taxi-booking-terms"[^>]*>([\s\S]*?)<\/ul>/)[1];
  assert.equal((terms.match(/<li>/g) || []).length, 4);
  for (const rule of ['per adres, niet per persoon', 'Heen en terug worden apart aangerekend', 'prijs is een schatting', 'Op de dag zelf boeken kost meer', 'vooraf heeft geboekt, krijgt voorrang']) {
    assert.ok(terms.includes(rule));
  }
});

test('Apps Script authenticates before doing any work and rejects legacy interest actions', () => {
  const { post, state } = gas();
  assert.equal(post({ ...input(), action: 'taxi_booking', secret: 'wrong' }).ok, false);
  assert.equal(post({ ...input(), action: 'taxi_interest', secret: 'test-secret' }).code, 'INVALID_INPUT');
  assert.equal(state.calls.length, 0);
  assert.equal(state.rows.length, 0);
});

test('API boundaries: configuration, upstream version, errors, privacy and allowed methods', async () => {
  const savedUrl = process.env.TAXI_GOOGLE_APPS_SCRIPT_URL;
  const savedSecret = process.env.TAXI_FORM_SECRET;
  const originalFetch = global.fetch;
  const call = async (action = 'taxi_booking', body = input(), method = 'POST') => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(value) { this.code = value; return this; }, json(value) { this.data = value; return this; } };
    await taxiHandler(action)({ method, body }, response);
    return response;
  };
  try {
    delete process.env.TAXI_GOOGLE_APPS_SCRIPT_URL;
    delete process.env.TAXI_FORM_SECRET;
    assert.equal((await call()).code, 503);
    assert.equal((await call('taxi_booking', input(), 'GET')).code, 405);
    assert.equal((await call('taxi_booking', input({ website: 'bot' }))).code, 400);
    assert.equal((await call('taxi_booking', '{bad-json')).code, 400);
    process.env.TAXI_GOOGLE_APPS_SCRIPT_URL = 'https://example.com/mock-gas';
    process.env.TAXI_FORM_SECRET = 'test-secret';
    global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, id: 'old-interest-id' }) });
    assert.equal((await call()).code, 503);
    global.fetch = async () => { throw new Error('Private upstream details'); };
    const failure = await call();
    assert.equal(failure.code, 502);
    assert.doesNotMatch(JSON.stringify(failure.data), /Private upstream|test-secret/);
    global.fetch = async (url, request) => {
      const payload = JSON.parse(request.body);
      assert.equal(payload.action, 'taxi_estimate');
      assert.equal(payload.name, undefined);
      assert.equal(payload.email, undefined);
      assert.equal(payload.totalCents, undefined);
      return { ok: true, json: async () => ({ version: 'taxi-booking-v1', ok: true, quote: { totalCents: 3200 } }) };
    };
    assert.equal((await call('taxi_estimate', input({ totalCents: 0 }))).data.quote.totalCents, 3200);
    global.fetch = async () => ({ ok: true, json: async () => ({ version: 'taxi-booking-v1', ok: true,
      id: 'TAXI-TEST', emailSent: false, secret: 'private' }) });
    const success = await call();
    assert.equal(success.code, 200);
    assert.equal(success.data.emailSent, false);
    assert.equal(success.data.secret, undefined);
    assert.equal(success.headers['Cache-Control'], 'no-store');
  } finally {
    global.fetch = originalFetch;
    if (savedUrl === undefined) delete process.env.TAXI_GOOGLE_APPS_SCRIPT_URL;
    else process.env.TAXI_GOOGLE_APPS_SCRIPT_URL = savedUrl;
    if (savedSecret === undefined) delete process.env.TAXI_FORM_SECRET;
    else process.env.TAXI_FORM_SECRET = savedSecret;
  }
});
