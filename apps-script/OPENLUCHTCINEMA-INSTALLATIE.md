# Aparte Google Sheet voor de openluchtcinema

Deze installatie maakt een volledig afzonderlijke Google Sheet en Apps Script-web-app.
De bestaande RAC GP-sheet en de bestaande rally-implementatie blijven ongewijzigd.

1. Meld aan bij `rotaractgaasbeek@gmail.com` en open https://script.google.com.
2. Kies **Nieuw project** en noem het `Openluchtcinema tickets 2026`.
3. Verwijder de voorbeeldcode en plak de volledige inhoud van `Openluchtcinema.gs`.
4. Kies bovenaan de functie **setupOpenluchtcinema** en klik op **Uitvoeren**.
5. Geef Google toestemming. Er wordt automatisch een nieuwe spreadsheet gemaakt met de naam
   **Openluchtcinema ticketbestellingen 2026**.
6. Open het **Uitvoeringslogboek** en kopieer:
   - de waarde achter `CINEMA_FORM_SECRET=`;
   - de link naar de nieuwe Google Sheet.
7. Kies **Implementeren → Nieuwe implementatie → Web-app**.
8. Stel in:
   - Uitvoeren als: **Ik**;
   - Wie heeft toegang: **Iedereen**.
9. Implementeer en kopieer de URL die eindigt op `/exec`.
10. Voeg in Vercel bij **Settings → Environment Variables** toe:
    - `CINEMA_GOOGLE_APPS_SCRIPT_URL`: de nieuwe `/exec`-URL;
    - `CINEMA_FORM_SECRET`: de geheime sleutel uit het uitvoeringslogboek.
11. Vink voor beide variabelen **Production** en **Preview** aan.
12. Start een nieuwe Vercel-deployment.

Test daarna één bestelling met Stripe in testmodus. De bestelling hoort uitsluitend in de
nieuwe spreadsheet **Openluchtcinema ticketbestellingen 2026** te verschijnen.

Bij wijzigingen aan `Openluchtcinema.gs` moet je via
**Implementeren → Implementaties beheren → Bewerken → Nieuwe versie** opnieuw implementeren.
