const TAXI_RECIPIENT = "rotaractgaasbeek@gmail.com";
const TAXI_SHEET_NAME = "Interesses";
const TAXI_EVENT_NAME = "Rotary Royal";
const TAXI_EVENT_DATE = "vrijdag 20 november 2026";
const TAXI_EVENT_LOCATION = "Krekelhof Gooik";
const TAXI_EVENT_START = "19.00 uur";
const TAXI_EVENT_PROGRAM =
  "Feestdiner en voorstelling van de sociale doelen";
const TAXI_LOGO_URL =
  "https://www.rotaractgaasbeek.be/assets/images/rotaract-masterbrand-transparent.png";

function setupTaxiService() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  let secret = properties.getProperty("FORM_SECRET");

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("FORM_SECRET", secret);
  }

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create("Taxi Service interesses");
    const sheet = spreadsheet.getSheets()[0];
    sheet.setName(TAXI_SHEET_NAME);
    setupTaxiSheet(sheet);
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  } else {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    ensureTaxiSheet(spreadsheet);
  }

  const spreadsheetUrl = SpreadsheetApp.openById(spreadsheetId).getUrl();
  console.log("TAXI_FORM_SECRET=" + secret);
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

    const interest = normalizeTaxiInterest(data);
    const validationMessage = validateTaxiInterest(interest);

    if (validationMessage) {
      return jsonResponse({ ok: false, message: validationMessage });
    }

    const interestId =
      "TAXI-" +
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
      ensureTaxiSheet(spreadsheet);
      sheet = spreadsheet.getSheetByName(TAXI_SHEET_NAME);

      sheet.appendRow([
        receivedAt,
        interestId,
        interest.name,
        interest.email,
        interest.phone,
        TAXI_EVENT_NAME,
        TAXI_EVENT_DATE,
        TAXI_EVENT_LOCATION,
        TAXI_EVENT_START,
        TAXI_EVENT_PROGRAM,
        "Wordt verzonden",
        "Interesse ontvangen - info later bezorgen",
      ]);

      rowNumber = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    let emailSent = false;

    try {
      sendOrganizerEmail(interest, interestId);
      sendParticipantConfirmation(interest, interestId);
      emailSent = true;
      sheet.getRange(rowNumber, 11).setValue("Ja");
    } catch (mailError) {
      console.error(mailError);
      sheet.getRange(rowNumber, 11).setValue("Nee - controleer Apps Script");
    }

    return jsonResponse({
      ok: true,
      id: interestId,
      emailSent: emailSent,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({
      ok: false,
      message: "Je interesse kon niet worden verwerkt.",
    });
  }
}

function normalizeTaxiInterest(data) {
  return {
    name: cleanValue(data.name, 120),
    email: cleanValue(data.email, 180),
    phone: cleanValue(data.phone, 80),
  };
}

function validateTaxiInterest(interest) {
  if (!interest.name || !interest.phone) {
    return "Controleer je naam en telefoonnummer.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(interest.email)) {
    return "Vul een geldig e-mailadres in.";
  }

  return "";
}

function ensureTaxiSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(TAXI_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(TAXI_SHEET_NAME);
  }

  setupTaxiSheet(sheet);
  return sheet;
}

function setupTaxiSheet(sheet) {
  const headers = [
    "Ontvangen op",
    "Interessenummer",
    "Naam",
    "E-mail",
    "Telefoonnummer",
    "Event",
    "Datum",
    "Locatie",
    "Start event",
    "Programma",
    "Bevestigingsmail verstuurd",
    "Status",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#D41367")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");
  sheet.autoResizeColumns(1, headers.length);
}

function sendOrganizerEmail(interest, interestId) {
  const signatureImages = getSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const rows = [
    ["Interessenummer", interestId],
    ["Naam", interest.name],
    ["E-mail", interest.email],
    ["Telefoonnummer", interest.phone],
    ["Event", TAXI_EVENT_NAME],
    ["Datum", TAXI_EVENT_DATE],
    ["Locatie", TAXI_EVENT_LOCATION],
    ["Start event", TAXI_EVENT_START],
    ["Programma", TAXI_EVENT_PROGRAM],
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
    to: TAXI_RECIPIENT,
    replyTo: interest.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Taxi Service - Nieuwe interesse van " + interest.name,
    body: plainText,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#18212c">' +
      '<h1 style="color:#d41367">Nieuwe interesse voor Taxi Service</h1>' +
      '<p>Deze persoon wil graag meer informatie over vervoer van en naar Rotary Royal.</p>' +
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

function sendParticipantConfirmation(interest, interestId) {
  const signatureImages = getSignatureImages();
  const hasInlineLogo = Object.keys(signatureImages).length > 0;
  const plainText =
    "Beste " + interest.name + ",\n\n" +
    "We hebben je interesse in de Taxi Service voor Rotary Royal goed ontvangen.\n\n" +
    "Event: " + TAXI_EVENT_NAME + "\n" +
    "Datum: " + TAXI_EVENT_DATE + "\n" +
    "Locatie: " + TAXI_EVENT_LOCATION + "\n" +
    "Start event: " + TAXI_EVENT_START + "\n" +
    "Programma: " + TAXI_EVENT_PROGRAM + "\n\n" +
    "Dit is nog geen reservatie. Zodra de prijs, ophaaluren en praktische afspraken bekend zijn, nemen we opnieuw contact met je op.\n\n" +
    "Je referentie is " + interestId + ".\n\n" +
    "Dit is een automatisch verstuurd bericht. Je hoeft hier niet op te antwoorden.\n\n" +
    "Met vriendelijke groeten,\n" +
    "Rotaract Gaasbeek Pajottenland\n" +
    "rotaractgaasbeek@gmail.com\n" +
    "www.rotaractgaasbeek.be";

  const mailOptions = {
    to: interest.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "We hebben je interesse in de Taxi Service ontvangen",
    body: plainText,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18212c;max-width:640px">' +
      "<p>Beste " + escapeHtml(interest.name) + ",</p>" +
      "<p>We hebben je interesse in de <strong>Taxi Service voor Rotary Royal</strong> goed ontvangen.</p>" +
      '<div style="padding:16px 18px;border-left:4px solid #D41367;background:#FCE8F1">' +
      "<strong>Dit is nog geen reservatie.</strong><br>" +
      "Zodra de prijs, ophaaluren en praktische afspraken bekend zijn, nemen we opnieuw contact met je op." +
      "</div>" +
      "<p><strong>Eventdetails</strong><br>" +
      escapeHtml(TAXI_EVENT_NAME) + "<br>" +
      escapeHtml(TAXI_EVENT_DATE) + "<br>" +
      escapeHtml(TAXI_EVENT_LOCATION) + "<br>" +
      "Start event: " + escapeHtml(TAXI_EVENT_START) + "<br>" +
      escapeHtml(TAXI_EVENT_PROGRAM) + "</p>" +
      "<p>Je referentie is <strong>" + escapeHtml(interestId) + "</strong>.</p>" +
      '<p style="font-size:13px;color:#667085">Dit is een automatisch verstuurd bericht. Je hoeft hier niet op te antwoorden.</p>' +
      emailSignatureHtml(hasInlineLogo) +
      "</div>",
  };

  if (hasInlineLogo) {
    mailOptions.inlineImages = signatureImages;
  }

  MailApp.sendEmail(mailOptions);
}

function getSignatureImages() {
  try {
    return {
      rotaractLogo: UrlFetchApp.fetch(TAXI_LOGO_URL)
        .getBlob()
        .setName("rotaract-logo.png"),
    };
  } catch (error) {
    console.error("Logo kon niet worden ingesloten", error);
    return {};
  }
}

function emailSignatureHtml(hasInlineLogo) {
  const logoSource = hasInlineLogo ? "cid:rotaractLogo" : TAXI_LOGO_URL;
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
