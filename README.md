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

De Google Ads-tag vraagt eerst toestemming en laadt anders niet. Een contactconversie
wordt alleen verstuurd als het formulier geldig is én de server bevestigt dat de
contactmail door Google Apps Script is verzonden. Klikken op de knop, een mislukte
verzending of het bezoeken van de contactpagina tellen niet als deze conversie.
De globale tag-ID is ingesteld op `AW-18456720108`. Voor activering ontbreekt nog
de **conversielabel** van een handmatig aangemaakte Google Ads-conversieactie.

1. Maak in Google Ads een websiteconversie voor een verzonden contactformulier.
   Kies **handmatig met code** (een eventfragment), niet een URL- of klikregel.
2. Zoek in het eventfragment `send_to: 'AW-18456720108/…'` en kopieer alleen
   het deel na de schuine streep.
3. Plak dat deel als `contactConversionLabel` in
   [`assets/js/google-consent.js`](assets/js/google-consent.js). Publiceer daarna
   de website opnieuw.
4. Test met toestemming voor meting: een geldig verzonden formulier moet één
   contactconversie geven; een ongeldige of mislukte verzending geen. Zet voor
   deze conversieactie geen automatische paginaweergave- of formulierklikmeting aan.

Er worden geen ingevulde formuliergegevens naar Google Ads gestuurd.

## Online steunen

De steunsectie op Onze impact gebruikt een Stripe-betaallink voor een bedrag naar keuze.
Voor de activering en automatische Stripe-betaalbewijzen: [Donaties installeren](DONATIES-INSTALLATIE.md).

## Beelden vervangen

De bestanden in `assets/images/` bevatten de Rotaract-logoassets, faviconbestanden en projectklare sfeerbeelden. Als de originele foto's als losse bestanden beschikbaar zijn, vervang dan de sfeerbeelden door echte foto's met dezelfde bestandsnamen of pas de `src`-waarden in de HTML aan.

Voor Google en browser-tabs zijn `favicon.ico`, `assets/images/favicon-48.png`, `assets/images/rotaract-icon-192.png`, `assets/images/rotaract-icon-512.png`, `site.webmanifest` en de metadata in de HTML toegevoegd.
