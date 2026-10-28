# Rotaract Gaasbeek Pajottenland website

Statische meerpagina-website voor Rotaract Gaasbeek Pajottenland.

## Pagina's

- `index.html`
- `events.html`
- `over-ons.html`
- `kalender.html`
- `contact.html`
- `taxi-service.html`

## Taxi Service

De taxipagina ondersteunt definitieve boekingen, prijsramingen via Google Maps,
Google Sheets-opslag en ontvangstbevestigingen. Voor activering en het veilig
bijwerken van de bestaande koppeling: [Taxi Service-installatie](apps-script/TAXI-SERVICE-INSTALLATIE.md).

Lokale tests zonder externe diensten: `node --test tests/taxi-service.test.cjs`.
Start een lokale preview met `node scripts/preview.cjs` (poort 4173).
Zonder Google-configuratie tonen berekening en boeken een beschikbaarheidsmelding;
de preview simuleert geen geslaagde boekingen.

## Contact en kennismaken

Het contactformulier verstuurt berichten en vrijblijvende kennismakingsvragen via
een aparte Google Apps Script-web-app naar de club. Voor de activering:
[Contactformulier-installatie](apps-script/CONTACT-INSTALLATIE.md).
Zonder de twee contactvariabelen blijft de verzendknop zichtbaar maar uitgeschakeld,
met een duidelijke beschikbaarheidsmelding.

## Google Ads-conversie voor het contactformulier

De Google Ads-tag gebruikt de geavanceerde variant van Consent Mode v2. Elke
pagina zet synchroon in de `<head>` alle vier toestemmingen standaard op
`denied` via [`assets/js/google-tag-bootstrap.js`](assets/js/google-tag-bootstrap.js),
en laadt daarna direct `gtag.js` met ID `AW-18456720108`. Bij een eerder
opgeslagen toestemming wordt de keuze nog vóór de eerste configuratie toegepast.
Zonder toestemming kan Google beperkte signalen zonder advertentiecookies
ontvangen; advertentiecookies blijven geweigerd. Test de tag op de gepubliceerde
website via Google Tag Assistant en controleer of de keuze voor advertentiecookies
correct wordt overgenomen.

Een contactconversie
wordt alleen verstuurd als het formulier geldig is én de server bevestigt dat de
contactmail door Google Apps Script is verzonden. Klikken op de knop, een mislukte
verzending of het bezoeken van de contactpagina tellen niet als deze conversie.
De globale tag-ID is `AW-18456720108`. De conversielabel voor
**Leadformulier indienen** is ingesteld in
[`assets/js/google-consent.js`](assets/js/google-consent.js). Publiceer de
website opnieuw en test met toestemming voor meting: een geldig verzonden
formulier moet één contactconversie geven; een ongeldige of mislukte verzending
geen. De voorbeeldcode van Google voor een knopklik hoeft niet te worden
geplakt. Zet voor deze conversieactie geen automatische paginaweergave- of
formulierklikmeting aan. De voorbeeldwaarde van 1 USD wordt niet meegestuurd;
controleer in Google Ads of de ingestelde conversiewaarde klopt voor een lead.

Er worden geen ingevulde formuliergegevens naar Google Ads gestuurd.

## Online steunen

De steunsectie op Onze impact gebruikt een Stripe-betaallink voor een bedrag naar keuze.
Voor de activering en automatische Stripe-betaalbewijzen: [Donaties installeren](DONATIES-INSTALLATIE.md).

## Vindbaarheid in zoekmachines en AI-antwoorden

De homepagina beschrijft onze club in Vlaams-Brabant, de contactpagina beantwoordt
vragen over lid worden en de over-ons-pagina legt uit wat Rotaract is. De site
heeft leesbare titels, canonieke URL's, organisatiegegevens in JSON-LD en een
[`sitemap.xml`](sitemap.xml). De sitemap vermeldt alleen een `lastmod` als de
betreffende pagina werkelijk is bijgewerkt.

Na publicatie: verifieer `www.rotaractgaasbeek.be` in Google Search Console,
dien `https://www.rotaractgaasbeek.be/sitemap.xml` in en inspecteer de URL's
van home, over ons en contact. Volg daarna de zoekopdrachten en klikken in het
prestatierapport; plaats nieuwe, concrete updates over clubmomenten en projecten
wanneer die er zijn. Vraag Rotary, lokale partners en relevante verenigingen
om naar de officiële site te linken waar dat inhoudelijk past. Een toppositie
voor brede zoekwoorden als `rotaract` of `rotaract vlaanderen` is niet
garandeerbaar; Google Ads-advertenties beïnvloeden de organische rangschikking
niet.

## Beelden vervangen

De bestanden in `assets/images/` bevatten de Rotaract-logoassets, faviconbestanden en projectklare sfeerbeelden. Als de originele foto's als losse bestanden beschikbaar zijn, vervang dan de sfeerbeelden door echte foto's met dezelfde bestandsnamen of pas de `src`-waarden in de HTML aan.

Voor Google en browser-tabs zijn `favicon.ico`, `assets/images/favicon-48.png`, `assets/images/rotaract-icon-192.png`, `assets/images/rotaract-icon-512.png`, `site.webmanifest` en de metadata in de HTML toegevoegd.
