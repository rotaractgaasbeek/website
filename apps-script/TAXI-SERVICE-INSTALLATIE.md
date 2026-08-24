# Taxi Service formulier instellen

1. Meld aan bij `rotaractgaasbeek@gmail.com` en open https://script.google.com.
2. Kies **Nieuw project** en geef het project de naam `Taxi Service interesses`.
3. Verwijder de voorbeeldcode en plak de volledige inhoud van `TaxiService.gs`.
4. Kies bovenaan de functie **setupTaxiService** en klik op **Uitvoeren**.
5. Geef Google toestemming. De functie maakt automatisch een aparte Google Sheet en een geheime sleutel aan.
6. Open onderaan **Uitvoeringslogboek**. Kopieer:
   - de waarde achter `TAXI_FORM_SECRET=`;
   - de Google Sheet-link, zodat je de interesses kunt openen.
7. Klik rechtsboven op **Implementeren** en daarna **Nieuwe implementatie**.
8. Kies als type **Web-app**.
9. Stel in:
   - Uitvoeren als: **Ik**
   - Wie heeft toegang: **Iedereen**
10. Klik op **Implementeren** en kopieer de web-app-URL die eindigt op `/exec`.
11. Voeg in Vercel onder **Settings → Environment Variables** toe:
   - `TAXI_GOOGLE_APPS_SCRIPT_URL`: de gekopieerde `/exec`-URL;
   - `TAXI_FORM_SECRET`: de sleutel uit het uitvoeringslogboek.
12. Start in Vercel een nieuwe deployment en test het Taxi Service-formulier.

Bij een volgende wijziging aan `TaxiService.gs` moet je in Apps Script via
**Implementeren → Implementaties beheren → Bewerken → Nieuwe versie**
opnieuw implementeren.
