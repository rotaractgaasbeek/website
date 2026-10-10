# Contactformulier en kennismakingsaanvragen activeren

De website heeft het vertrouwde contactformulier met naam, e-mail, onderwerp en bericht. De knoppen **Lid worden** en **Ik wil kennismaken** openen hetzelfde formulier met onderwerp en bericht al ingevuld. De mail gaat rechtstreeks naar `info@rotaractgaasbeek.be`; het mailprogramma van de bezoeker wordt niet geopend. Zonder onderstaande Google-koppeling blijft de knop uitgeschakeld en zegt de pagina duidelijk dat het formulier nog niet actief is.

## 1. Maak een apart Google Apps Script-project

1. Open [Google Apps Script](https://script.google.com/) met het Google-account waarvan de websiteberichten mogen worden verstuurd.
2. Maak een **nieuw, afzonderlijk project** voor contactberichten. Plak de volledige inhoud van [ContactService.gs](ContactService.gs) in de editor. Gebruik niet het bestaande taxi-, rally- of cinemaproject; die hebben hun eigen `doPost`.
3. Sla op en voer `setupContactService` één keer handmatig uit. Geef toestemming voor het versturen van e-mail wanneer Google erom vraagt.
4. Open **Projectinstellingen → Scriptproperties**. Kopieer de waarde van `CONTACT_FORM_SECRET` alleen naar de beveiligde Vercel-instellingen. Zet deze sleutel nooit in HTML, JavaScript, Git of een screenshot.
5. Kies **Implementeren → Nieuwe implementatie → Web-app**. Stel in: **Uitvoeren als: Ik** en **Toegang: Iedereen**. Kopieer de URL die op `/exec` eindigt.

Dit is een apart project zodat bestaande event- en taxiformulieren niet hoeven te worden aangepast. De web-app mag van buitenaf worden aangeroepen, maar accepteert alleen aanvragen met de geheime sleutel die de server van de website toevoegt.

## 2. Verbind het project met Vercel

Open in het Vercel-project **Settings → Environment Variables** en voeg voor **Production** toe:

- `CONTACT_GOOGLE_APPS_SCRIPT_URL`: de volledige web-app-URL uit stap 1, eindigend op `/exec`;
- `CONTACT_FORM_SECRET`: de waarde van de Scriptproperty met dezelfde naam.

Sla op en start een **nieuwe deployment** van de website. De pagina toont daarna de verzendknop als actief. De mail komt van het Google-account dat de web-app uitvoert; dankzij **Antwoorden aan** gaat een antwoord van de club rechtstreeks naar de bezoeker. Het formulier verstuurt **geen automatische mail aan de bezoeker** en meldt pas succes nadat de mail aan de club daadwerkelijk is verzonden.

## 3. Testen

1. Open `contact.html?onderwerp=lid-worden#contactformulier`. Het onderwerp **Lid worden** en een kort bericht moeten al ingevuld zijn; je kunt beide aanpassen.
2. Vul je eigen testnaam en e-mailadres in en verstuur. Je moet op dezelfde pagina **Bedankt! Je bericht is naar de club verstuurd** zien.
3. Controleer de inbox (en spam) van `info@rotaractgaasbeek.be`. Het onderwerp begint met `[Website] Mogelijk toekomstig lid`. Beantwoord de mail en controleer of het antwoord naar je testadres gaat.
4. Open ook `contact.html` zonder de extra linkgegevens en test een algemene vraag. Een bericht is altijd verplicht.
5. Werkt het niet, kijk dan in **Apps Script → Uitvoeringen** en controleer de twee Vercel-variabelen. Als je de code later aanpast, publiceer een **nieuwe versie** van de web-app.

Google legt de [web-app-instellingen](https://developers.google.com/apps-script/guides/web), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app) en [mailquota](https://developers.google.com/apps-script/guides/services/quotas) uit. Voor een gewoon Google-account geldt een lagere dagelijkse verzendlimiet dan voor Google Workspace; houd daar rekening mee als het aantal berichten groeit.
