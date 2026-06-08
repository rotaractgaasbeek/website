const RAC_GP_RECIPIENT = "rotaractgaasbeek@gmail.com";
const RAC_GP_SHEET_NAME = "Inschrijvingen";

function setupRacGp() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  let secret = properties.getProperty("FORM_SECRET");

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("FORM_SECRET", secret);
  }

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create("RAC GP inschrijvingen 2026");
    const sheet = spreadsheet.getSheets()[0];
    sheet.setName(RAC_GP_SHEET_NAME);
    sheet.appendRow([
      "Ontvangen op",
      "Inschrijvingsnummer",
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
    ]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 13)
      .setBackground("#D41367")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.autoResizeColumns(1, 13);
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  const spreadsheetUrl = SpreadsheetApp.openById(spreadsheetId).getUrl();
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
      sheet = SpreadsheetApp.openById(spreadsheetId)
        .getSheetByName(RAC_GP_SHEET_NAME);

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
      message: "De inschrijving kon niet worden verwerkt.",
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
  const rows = [
    ["Inschrijvingsnummer", registrationId],
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

  MailApp.sendEmail({
    to: RAC_GP_RECIPIENT,
    replyTo: registration.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "RAC GP - Inschrijving van " + registration.name,
    body: plainText,
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#18212c">' +
      '<h1 style="color:#d41367">Nieuwe inschrijving voor RAC GP</h1>' +
      '<table style="width:100%;border-collapse:collapse">' +
      htmlRows +
      "</table></div>",
  });
}

function sendParticipantConfirmation(registration, registrationId) {
  MailApp.sendEmail({
    to: registration.email,
    name: "Rotaract Gaasbeek Pajottenland",
    subject: "Bevestiging inschrijving RAC GP",
    body:
      "Bedankt voor je inschrijving voor RAC GP.\n\n" +
      "Je inschrijvingsnummer is " + registrationId + ".\n" +
      "We nemen binnenkort contact met je op met de verdere betaal- en deelnamedetails.\n\n" +
      "Rotaract Gaasbeek Pajottenland",
  });
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
