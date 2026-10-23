# Taxi Service opnieuw installeren, van nul

Deze handleiding hoort bij de **volledige code in [`TaxiService.gs`](TaxiService.gs)**.
De website stuurt prijsberekeningen en definitieve boekingen via Vercel naar deze
afzonderlijke Google Apps Script-web-app. Het script gebruikt Google Maps voor
de afstand, bewaart boekingen in Google Sheets en biedt twee e-mails voor
verzending aan: een ontvangstbevestiging voor de deelnemer en een melding voor
de organisatie.

**Belangrijk:** laat het oude project en de oude Sheets bestaan. De boeking
`TAXI-A759745D` uit de eerdere test is mogelijk in een andere Sheet opgeslagen.
Zoek die eerst op voordat je de oude koppeling buiten gebruik stelt. Een oude
Sheet met het tabblad `Interesses` is niet dezelfde Sheet als de nieuwe
definitieve boekingen in `Boekingen`. Behandel eerder ontvangen echte boekingen
apart; ze worden niet automatisch naar de nieuwe Sheet verplaatst.

## 1. Nieuw, leeg Apps Script-project maken

1. Log op [script.google.com](https://script.google.com/) in met het Google-account
   dat de taximails moet verzenden en eigenaar van de Sheet moet zijn.
2. Maak een **nieuw project**. Gebruik het bestaande project `Taxi Service
   interesses` niet opnieuw. Geef het bijvoorbeeld de naam `Rotaract Taxi
   Service boekingen 2026`.
3. Open `Code.gs`, verwijder de voorbeeldfunctie en plak de **volledige inhoud**
   van [`TaxiService.gs`](TaxiService.gs). Sla op. Plak de code niet onder de
   bestaande interessecode en niet in het contact- of rallyproject.

## 2. Nieuwe Sheet en geheime sleutel aanmaken

1. Kies bovenaan de functie **`setupTaxiService`** en klik op **Uitvoeren**.
   Geef toestemming voor Sheets, Maps en e-mail wanneer Google dat vraagt.
2. Open het **Uitvoeringslogboek**. Daar staat `Google Sheet: https://...`.
   Open precies die link. De Sheet moet een tabblad **Boekingen** hebben met
   kolomkoppen. Hij hoeft nog geen boekingen te bevatten.
3. Open in Apps Script **Projectinstellingen → Scriptproperties**. Controleer
   dat `SPREADSHEET_ID` en `FORM_SECRET` bestaan. Kopieer de waarde van
   `FORM_SECRET` tijdelijk naar een veilige plaats; deel hem niet in een chat,
   screenshot, HTML-bestand of Git.
4. Voer ook **`checkTaxiService`** uit. Het log toont opnieuw de exacte Sheet-link,
   de naam `Boekingen`, het aantal boekingen en het resterende mailquotum. Dit
   is de Sheet die de **nieuwe** web-app zal gebruiken.

`setupTaxiService` nogmaals uitvoeren maakt normaal geen tweede Sheet: het
hergebruikt de opgeslagen `SPREADSHEET_ID`. Gebruik voor een echt schone
herinstallatie dus een **nieuw project**, niet alleen een nieuwe implementatie
van het oude project.

## 3. Mail testen vóór de website omgaat

1. Voeg bij **Projectinstellingen → Scriptproperties** een derde eigenschap toe:
   naam `TEST_EMAIL`, waarde **je eigen e-mailadres**. Gebruik een adres waarvan
   je de inbox en spammap kunt controleren.
2. Kies de functie **`sendTaxiTestMail`** en klik op **Uitvoeren**. Google kan
   opnieuw toestemming vragen.
3. Controleer of de testmail werkelijk aankomt. Het log bevestigt alleen dat
   Google de verzendopdracht aannam; het bewijst geen aflevering. Komt er niets
   aan, ga nog niet verder: kijk in spam, controleer `TEST_EMAIL`, de eigenaar
   van het script, het mailquotum en **Uitvoeringen** in Apps Script.

De latere ontvangstbevestiging vertrekt vanuit het Google-account dat de
web-app uitvoert. `info@rotaractgaasbeek.be` is het antwoordadres, **niet
automatisch** het afzenderadres.

## 4. Nieuwe web-app publiceren

1. Kies **Implementeren → Nieuwe implementatie → Web-app**.
2. Stel **Uitvoeren als: Ik** in en **Wie heeft toegang: Iedereen**. De
   publieke link is nodig voor de website; de boekingsaanvragen zelf worden
   met de geheime `FORM_SECRET` gecontroleerd.
3. Klik **Implementeren** en kopieer de nieuwe **web-app-URL die op `/exec`
   eindigt**. Gebruik niet de `/dev`-URL of de URL van het oude interesseproject.
4. Open die `/exec`-URL in een browser. Je moet JSON zien met
   `"service":"rotaract-taxi-bookingen"` en `"version":"taxi-booking-v1"`.
   Deze controle maakt geen boeking. Zie je `Scriptfunctie niet gevonden: doGet`,
   dan is de verkeerde code of een oude implementatie gepubliceerd. Controleer
   dat de volledige `TaxiService.gs` is opgeslagen en publiceer **een nieuwe
   versie** van de web-app.

## 5. Nieuwe koppeling in Vercel zetten

Open in Vercel het project voor `www.rotaractgaasbeek.be` en ga naar
**Settings → Environment Variables**. Maak deze twee variabelen aan of vervang
hun oude waarden voor **Production**:

| Naam | Waarde |
| --- | --- |
| `TAXI_GOOGLE_APPS_SCRIPT_URL` | de **nieuwe** Apps Script-web-app-URL die op `/exec` eindigt |
| `TAXI_FORM_SECRET` | exact de `FORM_SECRET` uit **hetzelfde nieuwe** Apps Script-project |

De twee waarden moeten dus bij **dezelfde installatie** horen. Laat ze niet
in de websitecode, een openbaar bestand of een screenshot verschijnen. Zet ze
ook voor **Preview** als je die omgeving wilt testen. **Redeploy Production**
nadat je de variabelen hebt aangepast; een bestaande deployment neemt nieuwe
omgevingvariabelen niet vanzelf over. De websitecode gebruikt de functies
`/api/taxi-estimate` en `/api/taxi-booking`; er is geen aparte browser-Maps-key
nodig.

## 6. Einde-tot-eindecontrole met één eigen boeking

1. Open na de redeploy de **live** taxipagina, niet een lokaal `file://`-bestand.
2. Gebruik je eigen naam, e-mailadres, telefoonnummer en adres. Bereken de
   prijs en dien **één** duidelijk herkenbare testboeking in. Een inzending
   is een echte definitieve boeking en veroorzaakt echte mails.
3. Noteer het getoonde boekingsnummer. Open **de Sheet-link uit stap 2** en
   zoek op dat exacte nummer in tabblad **Boekingen**. Controleer of de naam,
   e-mail en mailstatus juist zijn. Markeer de rij desgewenst in `Status` als
   testboeking; verwijder geen oudere echte boekingen.
4. Controleer de ontvangstmail in de **inbox én spammap** van het ingevulde
   e-mailadres en de melding bij `info@rotaractgaasbeek.be`. Een status
   `Verstuurd` in Sheets betekent dat `MailApp.sendEmail` zonder fout terugkwam,
   niet dat de ontvanger de mail zeker heeft ontvangen.
5. Voer `checkTaxiService` nogmaals uit. Het aantal boekingen moet met één
   zijn gestegen. Als de website een boekingsnummer toont maar deze Sheet
   onveranderd is, wijst de website vrijwel zeker naar een andere
   Apps Script-implementatie of een ander project.

**Niet meteen opnieuw indienen bij twijfel.** Gebruik eerst het boekingsnummer
om dubbele boekingen te vermijden. Kijk ook in Apps Script **Uitvoeringen**:
een succesvolle website-inzending moet een uitvoering van `doPost` opleveren.

## Als iets niet klopt

- **`doGet` niet gevonden op `/exec`:** oude deployment of onvolledige code.
  Publiceer een nieuwe versie en vervang zo nodig de Vercel-URL.
- **Geen `doPost` in Uitvoeringen:** de website bereikt dit script niet.
  Controleer beide Vercel-variabelen, de Production-omgeving en redeploy.
- **`doPost` wel uitgevoerd maar geen rij:** kijk bij de uitvoering naar een
  fout voor Sheets of de validatie. Controleer `SPREADSHEET_ID` met
  `checkTaxiService`.
- **Rij aanwezig, geen ontvangstmail:** controleer `Ontvangstmail deelnemer`
  in de rij, het werkelijk ingevulde e-mailadres, spam, het Google-account
  dat het script uitvoert, quota en Apps Script-uitvoeringen. Bij `Niet
  verstuurd — handmatig opvolgen` moet de organisator de deelnemer zelf
  contacteren. Een mislukte mail verwijdert de boeking niet.
- **Mailstatus `Verstuurd`, maar niet ontvangen:** de verzendopdracht is
  geaccepteerd, maar aflevering kan alsnog mislukken. Controleer eventuele
  bounce-berichten in de mailbox van de script-eigenaar en test met een ander
  eigen adres. De organisatie moet zo nodig handmatig bevestigen.
- **Bestaande oude boeking `TAXI-A759745D`:** zoek dit nummer ook in andere
  Google Sheets en andere Apps Script-projecten voordat je de oude omgeving
  buiten gebruik stelt. De nieuwe installatie importeert niets automatisch.

De prijs blijft **€10 per adres per enkele rit, inclusief de eerste 5 km,
plus €2 per kilometer boven 5 km**. Heen en terug zijn aparte ritten; de
berekening is een schatting. Voor aanvragen op de dag zelf kan een toeslag
gelden, vooraf geboekte ritten krijgen voorrang. De ochtendrit naar de wagen
wordt tegen dezelfde vergoeding als de thuisrit berekend. Dit script sluit
nieuwe boekingen voor het evenement na **21 november 2026** af.
