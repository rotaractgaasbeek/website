const RAC_GP_RECIPIENT = "rotaractgaasbeek@gmail.com";
const RAC_GP_SHEET_NAME = "Inschrijvingen";
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
  ensureStatusColumn(SpreadsheetApp.openById(spreadsheetId));
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
