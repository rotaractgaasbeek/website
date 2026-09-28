# Taxi Service: definitieve boekingen activeren

De website gebruikt twee Vercel-functies: `/api/taxi-estimate` voor de prijsraming
en `/api/taxi-booking` voor de definitieve inschrijving. Beide gebruiken het
afzonderlijke Apps Script-project met `TaxiService.gs`. Dat project berekent de
rijafstand via Google Maps, slaat de boeking in Google Sheets op en verstuurt
een ontvangstmail naar de deelnemer en een melding naar de organisatie.

## Tarieven vóór publicatie controleren

De huidige berekening is **€10 per adres per enkele rit, inclusief de eerste
5 km, plus €2 per kilometer boven 5 km**. Bijvoorbeeld: 8 km kost €16;
bij 8 km in beide richtingen is het totaal €32. De afstand wordt niet naar
hele kilometers afgerond; het eindbedrag wordt afgerond op eurocenten.

De toeslag voor aanvragen op de dag zelf is bewust geen verzonnen bedrag:
deze wordt vóór vertrek afgesproken en is niet in de raming inbegrepen.
Vooraf geboekte ritten hebben voorrang. De ochtendrit naar de achtergelaten
wagen kost evenveel als de thuisrit, inclusief een eventuele toeslag.

## Bestaande koppeling bijwerken (aanbevolen)

1. Open het bestaande Taxi Service-project op [Google Apps Script](https://script.google.com/)
   met het Google-account waarmee de taxidienst al is ingesteld.
2. Vervang de code van dat project door de volledige inhoud van `TaxiService.gs`.
   Plak deze code **niet** bij het rally- of cinemaproject: elk project heeft
   zijn eigen `doPost` en instellingen.
3. Voer `setupTaxiService` uit. Bestaande `SPREADSHEET_ID` en `FORM_SECRET`
   blijven behouden. In dezelfde spreadsheet wordt het nieuwe tabblad
   **Boekingen** gemaakt. Het oude tabblad met interesses blijft ongewijzigd;
   eerdere interesses worden **niet** automatisch definitieve boekingen.
4. Controleer eventuele Google-toestemmingen voor Maps, Sheets en mail.
   Het uitvoeringslogboek toont de Sheet-link, maar geen geheimen.
5. Kies **Implementeren → Implementaties beheren → Bewerken → Nieuwe versie**.
   De web-app moet als de eigenaar worden uitgevoerd en toegang **Iedereen**
   toestaan. De geheime sleutel beveiligt de aanvragen vanuit Vercel.
6. Controleer dat de bestaande Vercel-variabelen nog overeenkomen:
   - `TAXI_GOOGLE_APPS_SCRIPT_URL`: de web-app-URL eindigend op `/exec`;
   - `TAXI_FORM_SECRET`: `FORM_SECRET` uit **Projectinstellingen → Scriptproperties**.
   Bij het bijwerken van dezelfde implementatie veranderen ze niet.
7. Publiceer de aangepaste website op Vercel. Controleer dat de nieuwe
   taxipagina en beide API-functies samen worden uitgerold.

Alleen de website publiceren is onvoldoende. Een oud interessescript wordt
door de nieuwe API geweigerd, zodat een onvolledige registratie niet ten
onrechte als definitieve boeking wordt bevestigd.

## Nog geen Taxi Service-project?

Maak een nieuw, afzonderlijk Apps Script-project, plak `TaxiService.gs` en
voer `setupTaxiService` uit. Deze maakt de Sheet en `FORM_SECRET` aan.
Gebruik vervolgens **Implementeren → Nieuwe implementatie → Web-app**, met
**Uitvoeren als: Ik** en **Toegang: Iedereen**. Voeg de `/exec`-URL en sleutel
als bovenstaande Vercel-variabelen toe en publiceer de website opnieuw.
Zet geen sleutels in HTML, Git of gedeelde screenshots. `.env.example` bevat
alleen voorbeeldwaarden; lokale `.env`-bestanden worden genegeerd door Git.

## Google Maps en e-mail

- De bestemming staat vast op **Krekelhof, Drie Egyptenbaan 11, 1755 Gooik**,
  gecontroleerd op de [contactpagina van Krekelhof](https://www.krekelhof.be/contact/).
- Apps Script gebruikt zijn ingebouwde [Maps DirectionFinder](https://developers.google.com/apps-script/reference/maps/direction-finder).
  Een aparte browser-API-sleutel of Maps JavaScript-bibliotheek is niet nodig.
  Naar Google Maps gaan uitsluitend routeadressen, geen namen, telefoonnummers
  of e-mailadressen van deelnemers.
- Heen- en terugrichting worden apart berekend; eenrichtingsstraten kunnen
  daardoor verschillende afstanden opleveren. Een ochtendrit gebruikt hetzelfde
  tarief als de thuisrit, zoals afgesproken, niet een nieuwe andere ritprijs.
- Routes worden maximaal 30 minuten tijdelijk gecachet. Een gewijzigd adres of
  ritkeuze maakt een oude raming ongeldig. Bedragen uit de browser worden nooit
  vertrouwd. Een definitieve boeking kan ook zonder werkende Maps-berekening
  worden opgeslagen; de prijs krijgt dan de status **nog af te spreken**.
- Mails worden verstuurd vanuit het Google-account dat de web-app uitvoert.
  De zichtbare naam is **Rotaract Gaasbeek Pajottenland**; antwoorden van de
  deelnemer gaan naar **info@rotaractgaasbeek.be**. `replyTo` verandert niet
  automatisch het echte afzenderadres in dat info-adres.
- [Google-quota](https://developers.google.com/apps-script/guides/services/quotas)
  blijven gelden voor routes en mail. Controleer ze voor het gebruikte account.
  Mailproblemen verwijderen nooit een opgeslagen boeking. In de Sheet staat
  dan **Niet verstuurd — handmatig opvolgen**. De website beweert in dat geval
  niet dat de mail verstuurd is. Volg zulke rijen handmatig op, ook rijen die
  onterecht op **Wordt verstuurd** blijven staan door een onderbroken uitvoering.

## Testen en dagelijks gebruik

Lokale controles (zonder echte Google-aanroepen of mails):

```sh
node --test tests/taxi-service.test.cjs
node scripts/preview.cjs
```

Open daarna `http://127.0.0.1:4173/taxi-service.html`. Zonder lokale
Vercel-variabelen werken de berekening en opslag niet: de pagina toont daarvoor
een duidelijke melding. Je kunt de variabelen lokaal laden met
`node --env-file=.env.local scripts/preview.cjs` op een actuele Node-versie.
Met echte variabelen worden inzendingen **echt opgeslagen en gemaild**.

Controleer na activering met een afgesproken testboeking en eigen e-mailadres:

1. Een volledig adres levert een herkenbaar Google Maps-adres en prijs per rit.
2. Het aantal personen verandert de prijs niet. Een adreswijziging wist de raming.
3. Geen enkele ritkeuze vraagt een gewenst ophaaluur. Ophaalmomenten worden
   apart afgestemd; de terugrit heeft geen vast uur. De oude uurkolommen in de
   Sheet blijven voor compatibiliteit bestaan, maar zijn bij nieuwe boekingen leeg.
4. Na indienen verschijnt een boekingsnummer en een rij in **Boekingen**,
   inclusief adres, contactgegevens, ritten, personen, prijsraming en mailstatus.
5. De deelnemer ontvangt de ontvangstmail en de organisatie haar melding.
6. Een herhaalde aanvraag met dezelfde aanvraag-ID en gegevens maakt geen
   tweede boeking of mail. Wijzigingen aan een ontvangen boeking verlopen via
   info@rotaractgaasbeek.be, met vermelding van het boekingsnummer.

De website gebruikt de Brusselse datum om aanvragen vanaf **20 november 2026**
als aanvragen op de dag zelf te markeren. Na **21 november 2026** worden geen
nieuwe boekingen voor dit evenement aanvaard. Pas datum, locatie en teksten
gezamenlijk aan wanneer de dienst voor een nieuw evenement wordt gebruikt.
De toegang tot de Sheet moet beperkt blijven tot de betrokken organisatoren;
deel het document niet publiek en volg het privacybeleid voor bewaring.
