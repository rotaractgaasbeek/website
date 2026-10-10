// Gebruik dit bestand in een afzonderlijk Apps Script-project.
// De website geeft de geheime sleutel alleen door vanuit de Vercel-functie.
var CONTACT_EMAIL = 'info@rotaractgaasbeek.be';
var CONTACT_TOPICS = {
  'lid-worden': 'Mogelijk toekomstig lid',
  'algemene-vraag': 'Algemene vraag',
  'samenwerking': 'Samenwerking',
  'event': 'Vraag over een event'
};

function setupContactService() {
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('CONTACT_FORM_SECRET')) {
    properties.setProperty('CONTACT_FORM_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  MailApp.getRemainingDailyQuota(); // Vraag de mailtoestemming tijdens de handmatige installatie.
  Logger.log('Klaar. Kopieer CONTACT_FORM_SECRET uit Projectinstellingen → Scriptproperties naar Vercel.');
}

function doPost(event) {
  try {
    var payload = JSON.parse(event.postData.contents || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('CONTACT_FORM_SECRET');
    if (!secret || payload.secret !== secret || payload.action !== 'contact') {
      return contactJson_({ ok: false, message: 'Niet toegestaan.' });
    }

    var name = String(payload.name || '').trim();
    var email = String(payload.email || '').trim().toLowerCase();
    var topic = String(payload.topic || '').trim();
    var submittedSubject = String(payload.subject || '').trim() || 'Vraag via website';
    var message = String(payload.message || '').trim();
    if (name.length < 2 || name.length > 100 || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !Object.prototype.hasOwnProperty.call(CONTACT_TOPICS, topic) ||
        submittedSubject.length > 120 || message.length > 5000 || !message) {
      return contactJson_({ ok: false, message: 'Ongeldige gegevens.' });
    }

    var category = CONTACT_TOPICS[topic];
    var safeSubject = submittedSubject.replace(/[\r\n]+/g, ' ');
    var subject = '[Website] ' + category + ' — ' + safeSubject;
    var body = [
      'Nieuw bericht via rotaractgaasbeek.be',
      '',
      'Categorie: ' + category,
      'Onderwerp: ' + safeSubject,
      'Naam: ' + name,
      'E-mail: ' + email,
      '',
      'Bericht:',
      message
    ].join('\n');

    MailApp.sendEmail({
      to: CONTACT_EMAIL,
      subject: subject,
      body: body,
      replyTo: email,
      name: 'Rotaract website'
    });
    return contactJson_({ ok: true });
  } catch (error) {
    console.error('Contactmail kon niet worden verstuurd: ' + error);
    return contactJson_({ ok: false, message: 'Mail versturen is niet gelukt.' });
  }
}

function contactJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
