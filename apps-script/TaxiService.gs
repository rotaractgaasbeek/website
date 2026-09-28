// Standalone Apps Script project: deploy this file as its own web app.
const TAXI_RECIPIENT = 'info@rotaractgaasbeek.be';
const TAXI_SHEET_NAME = 'Boekingen';
const TAXI_EVENT_DATE = 'vrijdag 20 november 2026';
const TAXI_VENUE = 'Krekelhof Gooik, Drie Egyptenbaan 11, 1755 Gooik, België';
const TAXI_DESTINATION = 'Drie Egyptenbaan 11, 1755 Gooik, Belgium';
const TAXI_TRIPS = {
  'round-trip': 'Heen en terug', outbound: 'Alleen naar Krekelhof',
  home: 'Alleen naar huis', 'home-morning': "Naar huis + 's ochtends naar mijn wagen",
};
const TAXI_HEADERS = [
  'Ontvangen op', 'Boekingsnummer', 'Aanvraag-ID', 'Controlecode',
  'Naam', 'E-mail', 'Telefoonnummer', 'Straat', 'Huisnummer', 'Postcode', 'Gemeente',
  'Aantal personen', 'Ritten', 'Gewenst ophaaluur vrijdag', 'Terugrit',
  'Gewenst ophaaluur zaterdag', 'Opmerkingen', 'Event', 'Datum', 'Locatie',
  'Prijsraming per rit (geen vaste eindprijs)', 'Geschat totaal EUR per adres',
  'Tarief', 'Voorrang vooraf geboekt', 'Akkoord op',
  'Ontvangstmail deelnemer', 'Melding organisatie', 'Status',
];
const TAXI_COL = { id: 2, request: 3, fingerprint: 4, total: 22, rate: 23, mail: 26, organizerMail: 27 };

function setupTaxiService() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!properties.getProperty('FORM_SECRET')) {
    properties.setProperty('FORM_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create('Taxi Service Rotary Royal');
    spreadsheetId = spreadsheet.getId();
    properties.setProperty('SPREADSHEET_ID', spreadsheetId);
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureTaxiSheet(spreadsheet);
  console.log('Google Sheet: ' + spreadsheet.getUrl());
  console.log('Gebruik FORM_SECRET uit Projectinstellingen → Scriptproperties als TAXI_FORM_SECRET in Vercel.');
}

function doPost(event) {
  try {
    const data = JSON.parse(event.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const secret = properties.getProperty('FORM_SECRET');
    if (!secret || data.secret !== secret) return taxiResponse({ ok: false, message: 'Ongeldige aanvraag.' });
    if (data.action !== 'taxi_estimate' && data.action !== 'taxi_booking') {
      return taxiResponse({ ok: false, code: 'INVALID_INPUT', message: 'Het interesseformulier is vervangen door definitieve boekingen. Herlaad de taxipagina.' });
    }
    const booking = normalizeTaxiBooking(data);
    const validation = validateTaxiBooking(booking, data.action === 'taxi_booking');
    if (validation) return taxiResponse({ ok: false, code: 'INVALID_INPUT', message: validation });
    if (data.action === 'taxi_estimate') {
      try {
        return taxiResponse({ ok: true, quote: createTaxiEstimate(booking) });
      } catch (error) {
        return taxiResponse({ ok: false, message: error.taxiPublicMessage || 'Google Maps kan de rijafstand momenteel niet berekenen. Je kunt wel boeken zonder prijsraming.' });
      }
    }
    if (!properties.getProperty('SPREADSHEET_ID')) return taxiResponse({ ok: false, message: 'Online boeken is tijdelijk niet beschikbaar. Mail info@rotaractgaasbeek.be.' });
    return taxiResponse(saveTaxiBooking(booking, properties.getProperty('SPREADSHEET_ID')));
  } catch (error) {
    console.error('Taxi processing failed: ' + (error.name || 'Error'));
    return taxiResponse({ ok: false, message: 'De ontvangst kon niet worden bevestigd. Probeer opnieuw met hetzelfde formulier of mail info@rotaractgaasbeek.be.' });
  }
}

function normalizeTaxiBooking(data) {
  const trip = cleanTaxi(data.trip, 30);
  return {
    street: cleanTaxi(data.street, 160), houseNumber: cleanTaxi(data.houseNumber, 20),
    postalCode: cleanTaxi(data.postalCode, 4), city: cleanTaxi(data.city, 100), trip: trip,
    name: cleanTaxi(data.name, 120), email: cleanTaxi(data.email, 180), phone: cleanTaxi(data.phone, 40),
    passengers: Number(data.passengers),
    notes: cleanTaxi(data.notes, 1500), consent: data.consent === true,
    requestId: cleanTaxi(data.requestId, 36), quoteToken: cleanTaxi(data.quoteToken, 36),
  };
}

function validateTaxiBooking(booking, full) {
  if (!booking.street || !booking.houseNumber || !/^\d{4}$/.test(booking.postalCode) || !booking.city) return 'Vul je volledige Belgische adres in.';
  if (!Object.prototype.hasOwnProperty.call(TAXI_TRIPS, booking.trip)) return 'Kies geldige ritten.';
  if (!full) return '';
  if (!booking.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email) || (booking.phone.match(/\d/g) || []).length < 7) return 'Controleer je contactgegevens.';
  if (!Number.isInteger(booking.passengers) || booking.passengers < 1 || booking.passengers > 50) return 'Vul een geldig aantal personen in (1 tot 50).';
  if (!booking.consent) return 'Bevestig je definitieve inschrijving en de tarieven.';
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(booking.requestId)) return 'Ongeldige aanvraag-ID. Herlaad de pagina.';
  return '';
}

function taxiAddress(booking) {
  return booking.street + ' ' + booking.houseNumber + ', ' + booking.postalCode + ' ' + booking.city + ', België';
}

function taxiRouteKey(booking) {
  return JSON.stringify([booking.street, booking.houseNumber, booking.postalCode, booking.city, booking.trip]);
}

function taxiSameDay() {
  return Utilities.formatDate(new Date(), 'Europe/Brussels', 'yyyy-MM-dd') >= '2026-11-20';
}

function taxiFareCents(meters) {
  if (!Number.isFinite(meters) || meters < 0) throw new Error('Invalid distance');
  // EUR 10 per address per leg, including 5 km; EUR 2 per extra km.
  // Round the final amount to cents, not the distance to whole km.
  return 1000 + Math.round(Math.max(0, meters - 5000) * 0.2);
}

function taxiDirections(origin, destination) {
  const result = Maps.newDirectionFinder().setOrigin(origin).setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING).setLanguage('nl').setRegion('be').getDirections();
  const leg = result.routes && result.routes[0] && result.routes[0].legs && result.routes[0].legs[0];
  const partial = (result.geocoded_waypoints || []).some(function (point) {
    return point.partial_match || (point.geocoder_status && point.geocoder_status !== 'OK');
  });
  if (partial || !leg || !leg.distance || !Number.isFinite(leg.distance.value) || leg.distance.value < 0) {
    const error = new Error('Route unavailable');
    error.taxiPublicMessage = 'Google Maps kon dit adres niet eenduidig vinden. Controleer straat, huisnummer, postcode en gemeente.';
    throw error;
  }
  return leg;
}

function createTaxiEstimate(booking) {
  const address = taxiAddress(booking);
  const legs = [];
  let resolvedAddress = '';
  if (booking.trip === 'outbound' || booking.trip === 'round-trip') {
    const route = taxiDirections(address, TAXI_DESTINATION);
    resolvedAddress = route.start_address;
    legs.push({ label: 'Naar Krekelhof', meters: route.distance.value, cents: taxiFareCents(route.distance.value) });
  }
  if (booking.trip !== 'outbound') {
    const route = taxiDirections(TAXI_DESTINATION, address);
    resolvedAddress = resolvedAddress || route.end_address;
    const home = { label: 'Naar huis', meters: route.distance.value, cents: taxiFareCents(route.distance.value) };
    legs.push(home);
    if (booking.trip === 'home-morning') {
      // Same fee as the preceding homeward ride, as requested by the club.
      legs.push({ label: 'Zaterdagochtend naar je wagen (zelfde vergoeding)', meters: home.meters, cents: home.cents });
    }
  }
  const quote = {
    token: Utilities.getUuid(), key: taxiRouteKey(booking), createdAt: Date.now(),
    resolvedAddress: resolvedAddress || address, legs: legs,
    totalCents: legs.reduce(function (sum, leg) { return sum + leg.cents; }, 0),
    sameDay: taxiSameDay(),
  };
  // Caching is an optimization; a cache outage must not discard a valid route.
  try { CacheService.getScriptCache().put('taxi-quote:' + quote.token, JSON.stringify(quote), 1800); }
  catch { console.error('Taxi quote cache unavailable'); }
  return quote;
}

function getTaxiEstimate(booking) {
  // Only server-generated quotes for the identical route are trusted.
  if (booking.quoteToken) {
    try {
      const cached = CacheService.getScriptCache().get('taxi-quote:' + booking.quoteToken);
      if (cached) {
        const quote = JSON.parse(cached);
        if (quote.key === taxiRouteKey(booking) && Date.now() - quote.createdAt < 1800000) return quote;
      }
    } catch { /* Recalculate when the optional cache is unavailable. */ }
  }
  try { return createTaxiEstimate(booking); } catch { return null; }
}

function taxiFingerprint(booking) {
  const copy = Object.assign({}, booking);
  delete copy.quoteToken;
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(copy)));
}

function findTaxiBooking(sheet, requestId, fingerprint) {
  if (sheet.getLastRow() < 2) return null;
  const match = sheet.getRange(2, TAXI_COL.request, sheet.getLastRow() - 1, 1)
    .createTextFinder(requestId).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = sheet.getRange(match.getRow(), 1, 1, TAXI_HEADERS.length).getValues()[0];
  if (row[TAXI_COL.fingerprint - 1] !== fingerprint) return {
    ok: false, code: 'INVALID_INPUT', message: 'Dit formulier hoort bij een al ontvangen boeking. Mail info@rotaractgaasbeek.be om die te wijzigen; je boeking wordt niet dubbel aangemaakt.',
  };
  return {
    ok: true, id: row[TAXI_COL.id - 1], emailSent: row[TAXI_COL.mail - 1] === 'Verstuurd',
    estimatePending: row[TAXI_COL.total - 1] === '', sameDay: row[TAXI_COL.rate - 1] === 'Dag zelf — toeslag af te spreken',
  };
}

function saveTaxiBooking(booking, spreadsheetId) {
  const sheet = ensureTaxiSheet(SpreadsheetApp.openById(spreadsheetId));
  const fingerprint = taxiFingerprint(booking);
  const existing = findTaxiBooking(sheet, booking.requestId, fingerprint);
  if (existing) return existing;
  if (Utilities.formatDate(new Date(), 'Europe/Brussels', 'yyyy-MM-dd') > '2026-11-21') return {
    ok: false, code: 'INVALID_INPUT', message: 'De boekingen voor Rotary Royal 2026 zijn afgesloten.',
  };
  const quote = getTaxiEstimate(booking);
  const sameDay = taxiSameDay();
  const receivedAt = new Date();
  const id = 'TAXI-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const lock = LockService.getScriptLock();
  let rowNumber;
  lock.waitLock(10000);
  try {
    const concurrent = findTaxiBooking(sheet, booking.requestId, fingerprint);
    if (concurrent) return concurrent;
    sheet.appendRow([
      receivedAt, id, booking.requestId, fingerprint,
      booking.name, booking.email, booking.phone, booking.street, booking.houseNumber, booking.postalCode, booking.city,
      // Keep legacy time columns empty so existing sheets remain compatible.
      booking.passengers, TAXI_TRIPS[booking.trip], '',
      booking.trip === 'outbound' ? 'Niet geboekt' : 'Vertrek naar keuze op de avond zelf',
      '', booking.notes, 'Rotary Royal', TAXI_EVENT_DATE, TAXI_VENUE,
      quote ? taxiQuoteText(quote) : 'Nog af te spreken — geen automatische raming beschikbaar',
      quote ? quote.totalCents / 100 : '',
      sameDay ? 'Dag zelf — toeslag af te spreken' : 'Vooraf geboekt',
      sameDay ? 'Nee' : 'Ja', receivedAt, 'Wordt verstuurd', 'Wordt verstuurd',
      'Definitieve inschrijving ontvangen — ophaalmoment afstemmen',
    ].map(taxiSheetValue));
    rowNumber = sheet.getLastRow();
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }

  // Mail failures never erase a booking or prevent the other message being sent.
  let emailSent = false;
  try {
    sendTaxiParticipantMail(booking, id, quote, sameDay);
    emailSent = true;
  } catch { console.error('Taxi participant email failed'); }
  setTaxiMailStatus(sheet, rowNumber, TAXI_COL.mail, emailSent);
  let organizerSent = false;
  try {
    sendTaxiOrganizerMail(booking, id, quote, sameDay);
    organizerSent = true;
  } catch { console.error('Taxi organizer email failed'); }
  setTaxiMailStatus(sheet, rowNumber, TAXI_COL.organizerMail, organizerSent);
  return { ok: true, id: id, emailSent: emailSent, estimatePending: !quote, sameDay: sameDay };
}

function setTaxiMailStatus(sheet, row, column, sent) {
  try { sheet.getRange(row, column).setValue(sent ? 'Verstuurd' : 'Niet verstuurd — handmatig opvolgen'); }
  catch { console.error('Taxi mail status update failed'); }
}

function ensureTaxiSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(TAXI_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(TAXI_SHEET_NAME);
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, TAXI_HEADERS.length).setValues([TAXI_HEADERS])
      .setBackground('#D41367').setFontColor('#FFFFFF').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, TAXI_HEADERS.length);
  } else {
    const headers = sheet.getRange(1, 1, 1, TAXI_HEADERS.length).getValues()[0];
    if (JSON.stringify(headers) !== JSON.stringify(TAXI_HEADERS)) throw new Error('Booking sheet schema mismatch');
  }
  return sheet;
}

function taxiSheetValue(value) {
  // User-entered strings must never become executable Sheets formulas.
  return typeof value === 'string' && /^[=+@\-\t\r\n]/.test(value) ? "'" + value : value;
}

function taxiEuro(cents) { return '€' + (cents / 100).toFixed(2).replace('.', ','); }

function taxiQuoteText(quote) {
  return quote.legs.map(function (leg) {
    return leg.label + ': ' + (leg.meters / 1000).toFixed(2).replace('.', ',') + ' km — ' + taxiEuro(leg.cents);
  }).join('\n');
}

function taxiMailDetails(booking, id, quote, sameDay) {
  return [
    ['Boekingsnummer', id], ['Naam', booking.name], ['E-mail', booking.email], ['Telefoonnummer', booking.phone],
    ['Adres', taxiAddress(booking)], ['Aantal personen', String(booking.passengers)], ['Ritten', TAXI_TRIPS[booking.trip]],
    ['Terug naar huis', booking.trip === 'outbound' ? 'Niet geboekt' : 'Wanneer je zelf wilt vertrekken, melden bij de chauffeurs'],
    ['Ochtendrit naar je wagen op 21 november', booking.trip === 'home-morning' ? 'Geboekt — ophaalmoment af te spreken' : 'Niet geboekt'],
    ['Opmerkingen', booking.notes || 'Geen'], ['Event', 'Rotary Royal — ' + TAXI_EVENT_DATE + ' om 19.00 uur'],
    ['Bestemming', TAXI_VENUE], ['Prijsraming per adres', quote ? taxiQuoteText(quote) + '\nGeschat totaal: ' + taxiEuro(quote.totalCents) : 'Nog af te spreken; er is geen automatische prijsraming beschikbaar.'],
    ['Tarief', sameDay ? 'Aanvraag op de dag zelf: toeslag vóór vertrek af te spreken. De toeslag is niet inbegrepen in de raming.' : 'Vooraf geboekt: voorrang op aanvragen op de dag zelf.'],
  ];
}

function sendTaxiParticipantMail(booking, id, quote, sameDay) {
  const paragraphs = [
    'Beste ' + booking.name + ',',
    'We hebben je definitieve inschrijving voor de Taxi Service van Rotary Royal goed ontvangen. Hieronder vind je je boekingsgegevens.',
    'We stemmen het exacte ophaalmoment met je af. Voor je terugrit bepaal je op de avond zelf wanneer je vertrekt. Onze chauffeurs staan de hele avond klaar; afhankelijk van de ritten kan er een wachttijd zijn.',
    'De prijs geldt per groep op hetzelfde adres, niet per persoon. Per enkele rit betaal je €10, inclusief de eerste 5 km, plus €2 per kilometer boven 5 km. Heen en terug worden apart aangerekend.',
    'De prijsraming is een schatting, geen vaste eindprijs. Wegenwerken, omleidingen, een gewijzigde route of andere omstandigheden kunnen de uiteindelijke prijs veranderen. Aanvragen op de dag zelf kosten meer; vooraf geboekte ritten krijgen voorrang.',
  ];
  if (booking.trip === 'home-morning') paragraphs.push('Je wagen blijft bij Krekelhof. Op zaterdagochtend brengen we je terug naar je wagen voor dezelfde vergoeding als je thuisrit de avond voordien, inclusief een eventuele toeslag. We spreken het exacte uur met je af.');
  paragraphs.push('Bewaar je boekingsnummer. Wil je iets wijzigen? Antwoord op deze mail of stuur je boekingsnummer naar info@rotaractgaasbeek.be.');
  sendTaxiMail(booking.email, 'Ontvangstbevestiging taxiboeking ' + id, paragraphs, taxiMailDetails(booking, id, quote, sameDay), TAXI_RECIPIENT);
}

function sendTaxiOrganizerMail(booking, id, quote, sameDay) {
  sendTaxiMail(TAXI_RECIPIENT, 'Nieuwe taxiboeking ' + id + ' — ' + booking.name,
    ['Er is een definitieve inschrijving ontvangen. Stem het ophaalmoment af en plan de gekozen ritten in.'],
    taxiMailDetails(booking, id, quote, sameDay), booking.email);
}

function sendTaxiMail(to, subject, paragraphs, details, replyTo) {
  const body = paragraphs.join('\n\n') + '\n\n' + details.map(function (row) { return row[0] + ': ' + row[1]; }).join('\n') +
    '\n\nRotaract Gaasbeek Pajottenland\ninfo@rotaractgaasbeek.be\nwww.rotaractgaasbeek.be';
  const htmlBody = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212c;max-width:680px">' +
    '<h1 style="color:#D41367;font-size:24px">Taxi Service · Rotary Royal</h1>' +
    paragraphs.map(function (text) { return '<p>' + escapeTaxiHtml(text) + '</p>'; }).join('') +
    '<table style="border-collapse:collapse;width:100%">' + details.map(function (row) {
      return '<tr><th style="text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #ddd">' + escapeTaxiHtml(row[0]) +
        '</th><td style="padding:10px;border-bottom:1px solid #ddd">' + escapeTaxiHtml(row[1]).replace(/\n/g, '<br>') + '</td></tr>';
    }).join('') + '</table><p><strong>Rotaract Gaasbeek Pajottenland</strong><br><a href="mailto:info@rotaractgaasbeek.be">info@rotaractgaasbeek.be</a></p></div>';
  MailApp.sendEmail({ to: to, subject: subject, name: 'Rotaract Gaasbeek Pajottenland', replyTo: replyTo, body: body, htmlBody: htmlBody });
}

function cleanTaxi(value, maxLength) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''; }
function escapeTaxiHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function taxiResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ version: 'taxi-booking-v1' }, data))).setMimeType(ContentService.MimeType.JSON);
}
