const CINEMA_RECIPIENT = "rotaractgaasbeek@gmail.com";
const CINEMA_SHEET_NAME = "Ticketbestellingen";
const CINEMA_LOGO_URL =
  "https://www.rotaractgaasbeek.be/assets/images/rotaract-masterbrand-transparent.png";

function setupOpenluchtcinema() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  let secret = properties.getProperty("FORM_SECRET");

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("FORM_SECRET", secret);
  }

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create(
      "Openluchtcinema ticketbestellingen 2026",
    );
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureCinemaSheet(spreadsheet);
  console.log("CINEMA_FORM_SECRET=" + secret);
  console.log("Cinema Google Sheet=" + spreadsheet.getUrl());
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
        message: "De Google Sheet voor de cinema is nog niet ingesteld.",
      });
    }

    if (data.action === "reserve_tickets") {
      return reserveCinemaTickets(data, spreadsheetId);
    }
    if (data.action === "attach_checkout") {
      return updateCinemaOrder(data, spreadsheetId, "Checkout gestart");
    }
    if (data.action === "release_reservation") {
      return updateCinemaOrder(data, spreadsheetId, "Vrijgegeven");
    }
    if (data.action === "payment_failed") {
      return updateCinemaOrder(data, spreadsheetId, "Betaling mislukt");
    }
    if (data.action === "payment_completed") {
      return completeCinemaPayment(data, spreadsheetId);
    }

    return jsonResponse({ ok: false, message: "Onbekende actie." });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      message: "De ticketbestelling kon niet worden verwerkt.",
    });
  }
}

function reserveCinemaTickets(data, spreadsheetId) {
  const order = normalizeCinemaOrder(data);
  const totalQuantity = cinemaQuantityFields().reduce(function (total, field) {
    return total + order[field];
  }, 0);

  if (
    !order.name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email) ||
    totalQuantity < 1
  ) {
    return jsonResponse({ ok: false, message: "Controleer de ticketgegevens." });
  }

  const totalCents =
    order.ratatouilleAdultQuantity * 1600 +
    order.ratatouilleChildQuantity * 1200 +
    order.ratatouilleGiftQuantity * 1200 +
    order.orientAdultQuantity * 1600 +
    order.orientChildQuantity * 1200 +
    order.orientGiftQuantity * 1200;
  let orderId;
  const lock = LockService.getScriptLock();

  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ensureCinemaSheet(spreadsheet);
    expireCinemaReservations(sheet);
    orderId = nextCinemaOrderId(sheet);
    sheet.appendRow([
      new Date(),
      orderId,
      order.name,
      order.email,
      order.phone,
      order.ratatouilleAdultQuantity,
      order.ratatouilleChildQuantity,
      order.ratatouilleGiftQuantity,
      order.orientAdultQuantity,
      order.orientChildQuantity,
      order.orientGiftQuantity,
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

function updateCinemaOrder(data, spreadsheetId, status) {
  const orderId = cleanValue(data.orderId, 80);
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ensureCinemaSheet(spreadsheet);
  const row = findCinemaOrderRow(sheet, orderId);

  if (!row) {
    return jsonResponse({ ok: false, message: "Bestelling niet gevonden." });
  }

  sheet.getRange(row, 13).setValue(status);
  if (data.stripeSessionId) {
    sheet.getRange(row, 14).setValue(cleanValue(data.stripeSessionId, 180));
  }
  return jsonResponse({ ok: true, orderId: orderId });
}

function completeCinemaPayment(data, spreadsheetId) {
  const orderId = cleanValue(data.orderId, 80);
  const lock = LockService.getScriptLock();
  let sheet;
  let row;
  let order;

  lock.waitLock(10000);
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    sheet = ensureCinemaSheet(spreadsheet);
    row = findCinemaOrderRow(sheet, orderId);

    if (!row) {
      return jsonResponse({ ok: false, message: "Bestelling niet gevonden." });
    }
    if (sheet.getRange(row, 13).getValue() === "Betaald") {
      return jsonResponse({ ok: true, orderId: orderId, duplicate: true });
    }

    sheet.getRange(row, 13).setValue("Betaald");
    sheet.getRange(row, 14).setValue(cleanValue(data.stripeSessionId, 180));
    sheet.getRange(row, 15).setValue(cleanValue(data.paymentIntentId, 180));
    order = cinemaOrderFromRow(sheet.getRange(row, 1, 1, 16).getValues()[0]);
  } finally {
    lock.releaseLock();
  }

  try {
    sendCinemaTicketEmails(order);
    sheet.getRange(row, 16).setValue("Ja");
  } catch (error) {
    console.error(error);
    sheet.getRange(row, 16).setValue("Nee - controleer Apps Script");
  }

  return jsonResponse({ ok: true, orderId: orderId });
}

function ensureCinemaSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CINEMA_SHEET_NAME);
  if (!sheet) {
    const sheets = spreadsheet.getSheets();
    sheet = sheets.length === 1 && sheets[0].getLastRow() === 0
      ? sheets[0].setName(CINEMA_SHEET_NAME)
      : spreadsheet.insertSheet(CINEMA_SHEET_NAME);
  }

  if (
    sheet.getLastColumn() >= 14 &&
    sheet.getRange(1, 14).getValue() === "Reservatie verloopt"
  ) {
    sheet.deleteColumn(14);
  }

  const headers = [
    "Aangemaakt op",
    "Bestelnummer",
    "Naam",
    "E-mail",
    "Telefoonnummer",
    "Ratatouille 13+",
    "Ratatouille t.e.m. 12 jaar",
    "Ratatouille schenktickets",
    "Murder on the Orient Express 13+",
    "Murder on the Orient Express t.e.m. 12 jaar",
    "Murder on the Orient Express schenktickets",
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

function normalizeCinemaOrder(data) {
  return {
    name: cleanValue(data.name, 120),
    email: cleanValue(data.email, 180),
    phone: cleanValue(data.phone, 80),
    ratatouilleAdultQuantity: positiveInteger(data.ratatouilleAdultQuantity, 500),
    ratatouilleChildQuantity: positiveInteger(data.ratatouilleChildQuantity, 500),
    ratatouilleGiftQuantity: positiveInteger(data.ratatouilleGiftQuantity, 500),
    orientAdultQuantity: positiveInteger(data.orientAdultQuantity, 500),
    orientChildQuantity: positiveInteger(data.orientChildQuantity, 500),
    orientGiftQuantity: positiveInteger(data.orientGiftQuantity, 500),
  };
}

function cinemaQuantityFields() {
  return [
    "ratatouilleAdultQuantity",
    "ratatouilleChildQuantity",
    "ratatouilleGiftQuantity",
    "orientAdultQuantity",
    "orientChildQuantity",
    "orientGiftQuantity",
  ];
}

function expireCinemaReservations(sheet) {
  if (sheet.getLastRow() < 2) return;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
  const now = new Date();
  rows.forEach(function (values, index) {
    if (
      (values[12] === "Gereserveerd" || values[12] === "Checkout gestart") &&
      values[0] instanceof Date &&
      now.getTime() - values[0].getTime() > 35 * 60 * 1000
    ) {
      sheet.getRange(index + 2, 13).setValue("Verlopen");
    }
  });
}

function nextCinemaOrderId(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const propertyName = "CINEMA_ORDER_SEQUENCE_2026";
  const storedSequence = properties.getProperty(propertyName);
  let sequence = storedSequence === null ? NaN : Number(storedSequence);

  if (!Number.isInteger(sequence) || sequence < 0) {
    sequence = 0;
    if (sheet.getLastRow() >= 2) {
      sheet
        .getRange(2, 2, sheet.getLastRow() - 1, 1)
        .getValues()
        .forEach(function (row) {
          const match = String(row[0] || "").match(/^CIN-2026-(\d+)$/);
          if (match) sequence = Math.max(sequence, Number(match[1]));
        });
    }
  }

  sequence += 1;
  properties.setProperty(propertyName, String(sequence));
  return "CIN-2026-" + Utilities.formatString("%04d", sequence);
}

function findCinemaOrderRow(sheet, orderId) {
  if (!orderId || sheet.getLastRow() < 2) return 0;
  const result = sheet
    .getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(orderId)
    .matchEntireCell(true)
    .findNext();
  return result ? result.getRow() : 0;
}

function cinemaOrderFromRow(row) {
  return {
    orderId: String(row[1]),
    name: String(row[2]),
    email: String(row[3]),
    phone: String(row[4] || ""),
    ratatouilleAdultQuantity: Number(row[5] || 0),
    ratatouilleChildQuantity: Number(row[6] || 0),
    ratatouilleGiftQuantity: Number(row[7] || 0),
    orientAdultQuantity: Number(row[8] || 0),
    orientChildQuantity: Number(row[9] || 0),
    orientGiftQuantity: Number(row[10] || 0),
    total: Number(row[11] || 0),
  };
}

function cinemaTicketLines(order) {
  const lines = [];
  if (order.ratatouilleAdultQuantity) lines.push(order.ratatouilleAdultQuantity + " × Ratatouille - 13+");
  if (order.ratatouilleChildQuantity) lines.push(order.ratatouilleChildQuantity + " × Ratatouille - t.e.m. 12 jaar");
  if (order.ratatouilleGiftQuantity) lines.push(order.ratatouilleGiftQuantity + " × Ratatouille - schenkticket VZW De Poel");
  if (order.orientAdultQuantity) lines.push(order.orientAdultQuantity + " × Murder on the Orient Express - 13+");
  if (order.orientChildQuantity) lines.push(order.orientChildQuantity + " × Murder on the Orient Express - t.e.m. 12 jaar");
  if (order.orientGiftQuantity) lines.push(order.orientGiftQuantity + " × Murder on the Orient Express - schenkticket VZW De Poel");
  return lines;
}

function sendCinemaTicketEmails(order) {
  const lines = cinemaTicketLines(order);
  const hasGift = order.ratatouilleGiftQuantity + order.orientGiftQuantity > 0;
  const signatureImages = getCinemaSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const giftNote = hasGift
    ? "\nJe schenkticket(s) worden aan VZW De Poel toegewezen en gelden niet als toegangsticket voor jezelf.\n"
    : "";
  const giftNoteHtml = hasGift
    ? '<p style="padding:14px;background:#fff4cf"><strong>Bedankt voor je schenking.</strong><br>Je schenkticket(s) worden aan VZW De Poel toegewezen en gelden niet als toegangsticket voor jezelf.</p>'
    : "";

  const participantOptions = {
    to: order.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Je tickets voor de openluchtcinema zijn bevestigd",
    body:
      "Beste " + order.name + ",\n\n" +
      "Je betaling is ontvangen en je bestelling is bevestigd.\n\n" +
      "Bestelnummer: " + order.orderId + "\n" +
      lines.join("\n") + "\n" +
      "Totaal: €" + order.total.toFixed(2).replace(".", ",") + "\n" +
      giftNote +
      "\nBewaar deze e-mail en toon je bestelnummer bij aankomst.\n\n" +
      "Rotaract Gaasbeek Pajottenland",
    htmlBody:
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212c;max-width:640px">' +
      "<p>Beste " + escapeHtml(order.name) + ",</p>" +
      '<h1 style="color:#D41367">Je cinemabestelling is bevestigd.</h1>' +
      "<p>We hebben je betaling goed ontvangen.</p>" +
      '<div style="padding:18px;background:#FCE8F1;border-left:4px solid #D41367">' +
      "<strong>Bestelnummer: " + escapeHtml(order.orderId) + "</strong><br>" +
      lines.map(escapeHtml).join("<br>") +
      "<br><strong>Totaal: €" + order.total.toFixed(2).replace(".", ",") + "</strong></div>" +
      giftNoteHtml +
      "<p>Bewaar deze e-mail en toon je bestelnummer bij aankomst.</p>" +
      cinemaEmailSignatureHtml(hasInlineLogo) +
      "</div>",
  };
  if (hasInlineLogo) participantOptions.inlineImages = signatureImages;
  MailApp.sendEmail(participantOptions);

  MailApp.sendEmail({
    to: CINEMA_RECIPIENT,
    replyTo: order.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Betaalde cinemabestelling - " + order.name,
    body:
      "Bestelnummer: " + order.orderId + "\n" +
      "Naam: " + order.name + "\n" +
      "E-mail: " + order.email + "\n" +
      "Telefoon: " + order.phone + "\n" +
      lines.join("\n") + "\n" +
      "Totaal: €" + order.total.toFixed(2).replace(".", ","),
  });
}

function getCinemaSignatureImages() {
  try {
    return { rotaractLogo: UrlFetchApp.fetch(CINEMA_LOGO_URL).getBlob() };
  } catch (error) {
    console.error(error);
    return {};
  }
}

function cinemaEmailSignatureHtml(hasInlineLogo) {
  return (
    '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #e1e5ea">' +
    (hasInlineLogo
      ? '<img src="cid:rotaractLogo" alt="Rotaract" style="display:block;width:220px;max-width:100%;height:auto;margin-bottom:12px">'
      : "") +
    "<strong>Rotaract Gaasbeek Pajottenland</strong><br>" +
    '<a href="mailto:rotaractgaasbeek@gmail.com">rotaractgaasbeek@gmail.com</a><br>' +
    '<a href="https://www.rotaractgaasbeek.be/">www.rotaractgaasbeek.be</a>' +
    "</div>"
  );
}

function positiveInteger(value, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum ? number : 0;
}

function cleanValue(value, maximumLength) {
  return String(value || "").trim().slice(0, maximumLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
