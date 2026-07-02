# RAC GP formulier instellen

1. Meld aan bij `rotaractgaasbeek@gmail.com` en open https://script.google.com.
2. Kies **Nieuw project** en geef het project de naam `RAC GP inschrijvingen`.
3. Verwijder de voorbeeldcode en plak de volledige inhoud van `Code.gs`.
4. Kies bovenaan de functie **setupRacGp** en klik op **Uitvoeren**.
5. Geef Google toestemming. De functie maakt automatisch de Google Sheet en een geheime sleutel aan.
6. Open onderaan **Uitvoeringslogboek**. Kopieer:
   - de waarde achter `RALLY_FORM_SECRET=`;
   - de Google Sheet-link, zodat je de inschrijvingen kunt openen.
7. Klik rechtsboven op **Implementeren** en daarna **Nieuwe implementatie**.
8. Kies als type **Web-app**.
9. Stel in:
   - Uitvoeren als: **Ik**
   - Wie heeft toegang: **Iedereen**
10. Klik op **Implementeren** en kopieer de web-app-URL die eindigt op `/exec`.
11. Voeg in Vercel onder **Settings → Environment Variables** toe:
   - `GOOGLE_APPS_SCRIPT_URL`: de gekopieerde `/exec`-URL;
   - `RALLY_FORM_SECRET`: de sleutel uit het uitvoeringslogboek.
12. Start in Vercel een nieuwe deployment en test het formulier.

Bij een volgende wijziging aan `Code.gs` moet je in Apps Script via
**Implementeren → Implementaties beheren → Bewerken → Nieuwe versie**
opnieuw implementeren.

Na het vervangen van de code mag je `setupRacGp` opnieuw uitvoeren. De bestaande
aanvragen blijven bewaard; de functie werkt alleen de kolomtitels en instellingen bij.
Daarbij wordt de verouderde kolom **Reservatie verloopt** automatisch verwijderd.
Nieuwe BBQ-bestellingen krijgen een kort nummer zoals `BBQ-2026-0001`.
