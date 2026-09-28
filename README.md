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

## Beelden vervangen

De bestanden in `assets/images/` bevatten de Rotaract-logoassets, faviconbestanden en projectklare sfeerbeelden. Als de originele foto's als losse bestanden beschikbaar zijn, vervang dan de sfeerbeelden door echte foto's met dezelfde bestandsnamen of pas de `src`-waarden in de HTML aan.

Voor Google en browser-tabs zijn `favicon.ico`, `assets/images/favicon-48.png`, `assets/images/rotaract-icon-192.png`, `assets/images/rotaract-icon-512.png`, `site.webmanifest` en de metadata in de HTML toegevoegd.
