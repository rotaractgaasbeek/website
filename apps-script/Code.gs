const RAC_GP_RECIPIENT = "rotaractgaasbeek@gmail.com";
const RAC_GP_SHEET_NAME = "Inschrijvingen";
const TICKET_SHEET_NAME = "Ticketbestellingen";
const BBQ_CAPACITY = 120;
const RAC_GP_LOGO_URL =
  "https://www.rotaractgaasbeek.be/assets/images/rotaract-masterbrand-transparent.png";

function setupRacGp() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  let secret = properties.getProperty("FORM_SECRET");

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("FORM_SECRET", secret);
  }

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create("RAC GP aanvragen 2026");
    const sheet = spreadsheet.getSheets()[0];
    sheet.setName(RAC_GP_SHEET_NAME);
    sheet.appendRow([
      "Ontvangen op",
      "Aanvraagnummer",
      "Naam",
      "E-mail",
      "Telefoonnummer",
      "Deelname",
      "Wagen",
      "Bouwjaar",
      "Nummerplaat",
      "Aantal personen",
      "Allergieën of dieetwensen",
      "Opmerkingen",
      "E-mailmelding verstuurd",
      "Status aanvraag",
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 14)
      .setBackground("#D41367")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.autoResizeColumns(1, 14);
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  const spreadsheetUrl = SpreadsheetApp.openById(spreadsheetId).getUrl();
  const configuredSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureStatusColumn(configuredSpreadsheet);
  ensureTicketSheet(configuredSpreadsheet);
  console.log("RALLY_FORM_SECRET=" + secret);
  console.log("Google Sheet=" + spreadsheetUrl);
}

function doPost(event) {
  try {
    const data = JSON.parse(event.postData.contents || "{}");
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty("FORM_SECRET");
    const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

    if (!expectedSecret || data.secret !== expectedSecret) {
      return jsonResponse({ ok: false, message: "Ongeldige aanvraag." });
    }

    if (!spreadsheetId) {
      return jsonResponse({
        ok: false,
        message: "De Google Sheet is nog niet ingesteld.",
      });
    }

    if (data.action === "reserve_tickets") {
      return reserveTickets(data, spreadsheetId);
    }

    if (data.action === "attach_checkout") {
      return updateTicketOrder(data, spreadsheetId, "Checkout gestart");
    }

    if (data.action === "release_reservation") {
      return updateTicketOrder(data, spreadsheetId, "Vrijgegeven");
    }

    if (data.action === "payment_failed") {
      return updateTicketOrder(data, spreadsheetId, "Betaling mislukt");
    }

    if (data.action === "payment_completed") {
      return completeTicketPayment(data, spreadsheetId);
    }

    const registration = normalizeRegistration(data);
    const validationMessage = validateRegistration(registration);

    if (validationMessage) {
      return jsonResponse({ ok: false, message: validationMessage });
    }

    const registrationId =
      "RAC-" +
      Utilities.formatDate(new Date(), "Europe/Brussels", "yyyyMMdd-HHmmss") +
      "-" +
      Utilities.getUuid().slice(0, 6).toUpperCase();
    const receivedAt = new Date();

    const lock = LockService.getScriptLock();
    let sheet;
    let rowNumber;

    lock.waitLock(10000);
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      ensureStatusColumn(spreadsheet);
      sheet = spreadsheet.getSheetByName(RAC_GP_SHEET_NAME);

      if (!sheet) {
        throw new Error("Het tabblad met inschrijvingen bestaat niet.");
      }

      sheet.appendRow([
        receivedAt,
        registrationId,
        registration.name,
        registration.email,
        registration.phone,
        registration.participation,
        registration.car || "Niet van toepassing",
        registration.year || "Niet van toepassing",
        registration.plate || "Niet van toepassing",
        registration.people,
        registration.diet || "Geen opgegeven",
        registration.remarks || "Geen",
        "Wordt verzonden",
        registration.participation === "Enkel BBQ"
          ? "Aanvraag ontvangen - betaling afwachten"
          : "Aanvraag ontvangen - wagen beoordelen",
      ]);

      rowNumber = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    let emailSent = false;

    try {
      sendOrganizerEmail(registration, registrationId);
      sendParticipantConfirmation(registration, registrationId);
      emailSent = true;
      sheet.getRange(rowNumber, 13).setValue("Ja");
    } catch (mailError) {
      console.error(mailError);
      sheet.getRange(rowNumber, 13).setValue("Nee - controleer Apps Script");
    }

    return jsonResponse({
      ok: true,
      id: registrationId,
      emailSent: emailSent,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      message: "De aanvraag kon niet worden verwerkt.",
    });
  }
}

function normalizeRegistration(data) {
  return {
    name: cleanValue(data.name, 120),
    email: cleanValue(data.email, 180),
    phone: cleanValue(data.phone, 80),
    participation: cleanValue(data.participation, 120),
    car: cleanValue(data.car, 160),
    year: cleanValue(data.year, 20),
    plate: cleanValue(data.plate, 40),
    people: cleanValue(data.people, 10),
    diet: cleanValue(data.diet, 500),
    remarks: cleanValue(data.remarks, 2000),
    consent: cleanValue(data.consent, 20),
  };
}

function validateRegistration(registration) {
  if (
    !registration.name ||
    !registration.email ||
    !registration.phone ||
    !registration.participation ||
    !registration.people ||
    !registration.consent
  ) {
    return "Controleer de verplichte velden.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registration.email)) {
    return "Vul een geldig e-mailadres in.";
  }

  if (
    registration.participation !== "Enkel BBQ" &&
    (!registration.car || !registration.year || !registration.plate)
  ) {
    return "Vul de gegevens van de wagen volledig in.";
  }

  return "";
}

function sendOrganizerEmail(registration, registrationId) {
  const signatureImages = getSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const rows = [
    ["Aanvraagnummer", registrationId],
    ["Naam", registration.name],
    ["E-mail", registration.email],
    ["Telefoonnummer", registration.phone],
    ["Deelname", registration.participation],
    ["Wagen", registration.car || "Niet van toepassing"],
    ["Bouwjaar", registration.year || "Niet van toepassing"],
    ["Nummerplaat", registration.plate || "Niet van toepassing"],
    ["Aantal personen inclusief bestuurder", registration.people],
    ["Allergieën of dieetwensen", registration.diet || "Geen opgegeven"],
    ["Opmerkingen", registration.remarks || "Geen"],
  ];

  const plainText = rows.map(function (row) {
    return row[0] + ": " + row[1];
  }).join("\n");

  const htmlRows = rows.map(function (row) {
    return (
      '<tr><th style="padding:10px;text-align:left;border-bottom:1px solid #ddd">' +
      escapeHtml(row[0]) +
      '</th><td style="padding:10px;border-bottom:1px solid #ddd">' +
      escapeHtml(row[1]) +
      "</td></tr>"
    );
  }).join("");

  const mailOptions = {
    to: RAC_GP_RECIPIENT,
    replyTo: registration.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "RAC GP - Nieuwe aanvraag van " + registration.name,
    body: plainText,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#18212c">' +
      '<h1 style="color:#d41367">Nieuwe deelnameaanvraag voor RAC GP</h1>' +
      '<table style="width:100%;border-collapse:collapse">' +
      htmlRows +
      "</table>" +
      emailSignatureHtml(hasInlineLogo) +
      "</div>",
  };

  if (hasInlineLogo) {
    mailOptions.inlineImages = signatureImages;
  }

  MailApp.sendEmail(mailOptions);
}

function sendParticipantConfirmation(registration, registrationId) {
  const signatureImages = getSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const plainText =
    "Beste " + registration.name + ",\n\n" +
    "We hebben je deelnameaanvraag voor RAC GP goed ontvangen.\n\n" +
    "Dit is nog geen officiële inschrijving. We beoordelen eerst je aanvraag" +
    (registration.participation === "Enkel BBQ"
      ? "."
      : " en de wagen waarmee je wil deelnemen.") +
    " Daarna nemen we persoonlijk contact met je op over de goedkeuring en de mogelijkheid om de tickets te betalen. Je deelname is pas officieel nadat je aanvraag is goedgekeurd en de betaling ontvangen is.\n\n" +
    "Je aanvraagnummer is " + registrationId + ".\n\n" +
    "Dit is een automatisch verstuurd bericht. Je hoeft hier niet op te antwoorden.\n\n" +
    "Met vriendelijke groeten,\n" +
    "Rotaract Gaasbeek Pajottenland\n" +
    "rotaractgaasbeek@gmail.com\n" +
    "www.rotaractgaasbeek.be";

  const reviewText = registration.participation === "Enkel BBQ"
    ? "We bekijken je aanvraag en nemen daarna persoonlijk contact met je op over de mogelijkheid om de tickets te betalen."
    : "We beoordelen eerst je aanvraag en de wagen waarmee je wil deelnemen. Daarna nemen we persoonlijk contact met je op over de goedkeuring en de mogelijkheid om de tickets te betalen.";

  const mailOptions = {
    to: registration.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Ontvangstbevestiging aanvraag RAC GP",
    body: plainText,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212c;max-width:640px">' +
      "<p>Beste " + escapeHtml(registration.name) + ",</p>" +
      "<p>We hebben je deelnameaanvraag voor <strong>RAC GP</strong> goed ontvangen.</p>" +
      '<div style="padding:16px 18px;border-left:4px solid #D41367;background:#FCE8F1">' +
      "<strong>Dit is nog geen officiële inschrijving.</strong><br>" +
      escapeHtml(reviewText) +
      " Je deelname is pas officieel nadat je aanvraag is goedgekeurd en de betaling ontvangen is." +
      "</div>" +
      "<p>Je aanvraagnummer is <strong>" + escapeHtml(registrationId) + "</strong>.</p>" +
      '<p style="font-size:13px;color:#667085">Dit is een automatisch verstuurd bericht. Je hoeft hier niet op te antwoorden. We nemen zelf contact met je op.</p>' +
      emailSignatureHtml(hasInlineLogo) +
      "</div>",
  };

  if (hasInlineLogo) {
    mailOptions.inlineImages = signatureImages;
  }

  MailApp.sendEmail(mailOptions);
}

function reserveTickets(data, spreadsheetId) {
  const order = {
    event: cleanValue(data.event, 80),
    name: cleanValue(data.name, 120),
    email: cleanValue(data.email, 180),
    phone: cleanValue(data.phone, 80),
    bbqQuantity: positiveInteger(data.bbqQuantity, 120),
    adultQuantity: positiveInteger(data.adultQuantity, 500),
    childQuantity: positiveInteger(data.childQuantity, 500),
  };

  if (
    !order.name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email) ||
    order.bbqQuantity + order.adultQuantity + order.childQuantity < 1
  ) {
    return jsonResponse({ ok: false, message: "Controleer de ticketgegevens." });
  }

  const totalCents =
    order.bbqQuantity * 10000 +
    order.adultQuantity * 1500 +
    order.childQuantity * 1000;
  let orderId;
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    ensureTicketSheet(spreadsheet);
    const sheet = spreadsheet.getSheetByName(TICKET_SHEET_NAME);
    expireOldReservations(sheet);

    if (order.bbqQuantity > 0) {
      const soldAndReserved = countReservedBbqTickets(sheet);
      if (soldAndReserved + order.bbqQuantity > BBQ_CAPACITY) {
        const remaining = Math.max(0, BBQ_CAPACITY - soldAndReserved);
        return jsonResponse({
          ok: false,
          message:
            remaining === 0
              ? "De BBQ is helaas uitverkocht."
              : "Er zijn nog slechts " + remaining + " BBQ-tickets beschikbaar.",
        });
      }
    }

    orderId = nextTicketOrderId(sheet);

    sheet.appendRow([
      new Date(),
      orderId,
      order.event,
      order.name,
      order.email,
      order.phone,
      order.bbqQuantity,
      order.adultQuantity,
      order.childQuantity,
      totalCents / 100,
      "Gereserveerd",
      "",
      "",
      "Nee",
    ]);
  } finally {
    lock.releaseLock();
  }

  return jsonResponse({ ok: true, orderId: orderId });
}

function updateTicketOrder(data, spreadsheetId, status) {
  const orderId = cleanValue(data.orderId, 80);
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureTicketSheet(spreadsheet);
  const sheet = spreadsheet.getSheetByName(TICKET_SHEET_NAME);
  const row = findTicketOrderRow(sheet, orderId);

  if (!row) {
    return jsonResponse({ ok: false, message: "Bestelling niet gevonden." });
  }

  sheet.getRange(row, 11).setValue(status);
  if (data.stripeSessionId) {
    sheet.getRange(row, 12).setValue(cleanValue(data.stripeSessionId, 180));
  }

  return jsonResponse({ ok: true, orderId: orderId });
}

function completeTicketPayment(data, spreadsheetId) {
  const orderId = cleanValue(data.orderId, 80);
  const lock = LockService.getScriptLock();
  let sheet;
  let row;
  let order;

  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    ensureTicketSheet(spreadsheet);
    sheet = spreadsheet.getSheetByName(TICKET_SHEET_NAME);
    row = findTicketOrderRow(sheet, orderId);

    if (!row) {
      return jsonResponse({ ok: false, message: "Bestelling niet gevonden." });
    }

    if (sheet.getRange(row, 11).getValue() === "Betaald") {
      return jsonResponse({ ok: true, orderId: orderId, duplicate: true });
    }

    sheet.getRange(row, 11).setValue("Betaald");
    sheet.getRange(row, 12).setValue(cleanValue(data.stripeSessionId, 180));
    sheet.getRange(row, 13).setValue(cleanValue(data.paymentIntentId, 180));

    const values = sheet.getRange(row, 1, 1, 14).getValues()[0];
    order = ticketOrderFromRow(values);
  } finally {
    lock.releaseLock();
  }

  try {
    sendTicketEmails(order);
    sheet.getRange(row, 14).setValue("Ja");
  } catch (error) {
    console.error(error);
    sheet.getRange(row, 14).setValue("Nee - controleer Apps Script");
  }

  return jsonResponse({ ok: true, orderId: orderId });
}

function ensureTicketSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(TICKET_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TICKET_SHEET_NAME);
  }

  if (
    sheet.getLastColumn() >= 12 &&
    sheet.getRange(1, 12).getValue() === "Reservatie verloopt"
  ) {
    sheet.deleteColumn(12);
  }

  const headers = [
    "Aangemaakt op",
    "Bestelnummer",
    "Event",
    "Naam",
    "E-mail",
    "Telefoonnummer",
    "BBQ-tickets",
    "Volwassenen",
    "Kinderen t.e.m. 12 jaar",
    "Totaal euro",
    "Status",
    "Stripe Checkout Session",
    "Stripe Payment Intent",
    "Bevestigingsmail verstuurd",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#D41367")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function expireOldReservations(sheet) {
  if (sheet.getLastRow() < 2) {
    return;
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  const now = new Date();

  rows.forEach(function (row, index) {
    const status = row[10];
    const createdAt = row[0];
    if (
      (status === "Gereserveerd" || status === "Checkout gestart") &&
      createdAt instanceof Date &&
      now.getTime() - createdAt.getTime() > 35 * 60 * 1000
    ) {
      sheet.getRange(index + 2, 11).setValue("Verlopen");
    }
  });
}

function countReservedBbqTickets(sheet) {
  if (sheet.getLastRow() < 2) {
    return 0;
  }

  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 14)
    .getValues()
    .reduce(function (total, row) {
      const status = row[10];
      return status === "Gereserveerd" ||
        status === "Checkout gestart" ||
        status === "Betaald"
        ? total + Number(row[6] || 0)
        : total;
    }, 0);
}

function nextTicketOrderId(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const propertyName = "BBQ_ORDER_SEQUENCE_2026";
  const storedSequence = properties.getProperty(propertyName);
  let sequence = storedSequence === null ? NaN : Number(storedSequence);

  if (!Number.isInteger(sequence) || sequence < 0) {
    sequence = 0;
    if (sheet.getLastRow() >= 2) {
      sheet
        .getRange(2, 2, sheet.getLastRow() - 1, 1)
        .getValues()
        .forEach(function (row) {
          const match = String(row[0] || "").match(/^BBQ-2026-(\d+)$/);
          if (match) sequence = Math.max(sequence, Number(match[1]));
        });
    }
  }

  sequence += 1;
  properties.setProperty(propertyName, String(sequence));
  return "BBQ-2026-" + Utilities.formatString("%04d", sequence);
}

function findTicketOrderRow(sheet, orderId) {
  if (!orderId || sheet.getLastRow() < 2) {
    return 0;
  }

  const finder = sheet
    .getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(orderId)
    .matchEntireCell(true)
    .findNext();
  return finder ? finder.getRow() : 0;
}

function ticketOrderFromRow(row) {
  return {
    orderId: String(row[1]),
    event: String(row[2]),
    name: String(row[3]),
    email: String(row[4]),
    phone: String(row[5] || ""),
    bbqQuantity: Number(row[6] || 0),
    adultQuantity: Number(row[7] || 0),
    childQuantity: Number(row[8] || 0),
    total: Number(row[9] || 0),
  };
}

function sendTicketEmails(order) {
  const signatureImages = getSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const ticketLines = [];

  if (order.bbqQuantity) {
    ticketLines.push(order.bbqQuantity + " × RAC GP BBQ");
  }
  if (order.adultQuantity) {
    ticketLines.push(order.adultQuantity + " × Openluchtcinema volwassene");
  }
  if (order.childQuantity) {
    ticketLines.push(
      order.childQuantity + " × Openluchtcinema kind t.e.m. 12 jaar",
    );
  }

  const participantOptions = {
    to: order.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Betalingsbevestiging en tickets - " + order.event,
    body:
      "Beste " + order.name + ",\n\n" +
      "Je betaling is ontvangen. Je tickets zijn officieel bevestigd.\n\n" +
      "Bestelnummer: " + order.orderId + "\n" +
      ticketLines.join("\n") + "\n" +
      "Totaal: €" + order.total.toFixed(2).replace(".", ",") + "\n\n" +
      "Bewaar deze e-mail en toon je bestelnummer bij aankomst.\n\n" +
      "Rotaract Gaasbeek Pajottenland",
    htmlBody:
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212c;max-width:640px">' +
      "<p>Beste " + escapeHtml(order.name) + ",</p>" +
      "<h1 style=\"color:#D41367\">Je tickets zijn bevestigd.</h1>" +
      "<p>We hebben je betaling goed ontvangen.</p>" +
      '<div style="padding:18px;background:#FCE8F1;border-left:4px solid #D41367">' +
      "<strong>Bestelnummer: " + escapeHtml(order.orderId) + "</strong><br>" +
      ticketLines.map(escapeHtml).join("<br>") +
      "<br><strong>Totaal: €" +
      order.total.toFixed(2).replace(".", ",") +
      "</strong></div>" +
      "<p>Bewaar deze e-mail en toon je bestelnummer bij aankomst.</p>" +
      emailSignatureHtml(hasInlineLogo) +
      "</div>",
  };

  if (hasInlineLogo) {
    participantOptions.inlineImages = signatureImages;
  }
  MailApp.sendEmail(participantOptions);

  MailApp.sendEmail({
    to: RAC_GP_RECIPIENT,
    replyTo: order.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Betaalde ticketbestelling - " + order.event + " - " + order.name,
    body:
      "Bestelnummer: " + order.orderId + "\n" +
      "Naam: " + order.name + "\n" +
      "E-mail: " + order.email + "\n" +
      ticketLines.join("\n") + "\n" +
      "Totaal: €" + order.total.toFixed(2).replace(".", ","),
  });
}

function positiveInteger(value, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum
    ? number
    : 0;
}

function ensureStatusColumn(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(RAC_GP_SHEET_NAME);
  if (!sheet) {
    return;
  }

  sheet.getRange(1, 2).setValue("Aanvraagnummer");

  if (sheet.getLastColumn() < 14 || sheet.getRange(1, 14).getValue() !== "Status aanvraag") {
    sheet.getRange(1, 14).setValue("Status aanvraag");
    sheet.getRange(1, 14)
      .setBackground("#D41367")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.autoResizeColumn(14);
  }
}

function getSignatureImages() {
  try {
    return {
      rotaractLogo: UrlFetchApp.fetch(RAC_GP_LOGO_URL)
        .getBlob()
        .setName("rotaract-logo.png"),
    };
  } catch (error) {
    console.error("Logo kon niet worden ingesloten", error);
    return {};
  }
}

function emailSignatureHtml(hasInlineLogo) {
  const logoSource = hasInlineLogo ? "cid:rotaractLogo" : RAC_GP_LOGO_URL;
  return (
    '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #E4E7EC">' +
    '<img src="' + logoSource + '" alt="Rotaract" width="220" style="display:block;max-width:220px;height:auto;margin-bottom:12px">' +
    '<strong style="color:#D41367">Rotaract Gaasbeek Pajottenland</strong><br>' +
    '<span style="font-size:14px;color:#667085">Jonge mensen, lokale impact en vriendschap in het Pajottenland.</span><br>' +
    '<a href="mailto:rotaractgaasbeek@gmail.com" style="color:#D41367">rotaractgaasbeek@gmail.com</a><br>' +
    '<a href="https://www.rotaractgaasbeek.be/" style="color:#D41367">www.rotaractgaasbeek.be</a>' +
    "</div>"
  );
}

function cleanValue(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
