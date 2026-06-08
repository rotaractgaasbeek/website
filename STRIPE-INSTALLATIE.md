# Stripe instellen voor de ticketverkoop

## 1. Stripe-account activeren

1. Meld aan bij https://dashboard.stripe.com.
2. Vul de bedrijfs- en uitbetalingsgegevens van Rotaract Gaasbeek Pajottenland in.
3. Activeer onder **Settings → Payment methods** de betaalmethode **Bancontact**.

## 2. Eerst in testmodus instellen

1. Zet in Stripe **Test mode** aan.
2. Open **Developers → API keys**.
3. Kopieer de `Secret key` die begint met `sk_test_`.
4. Voeg in Vercel bij **Settings → Environment Variables** toe:
   - Key: `STRIPE_SECRET_KEY`
   - Value: de gekopieerde `sk_test_...`-sleutel
   - Environments: Production en Preview
5. Voeg ook toe:
   - Key: `SITE_URL`
   - Value: `https://www.rotaractgaasbeek.be`
   - Environments: Production en Preview

## 3. Webhook toevoegen

1. Open in Stripe **Developers → Webhooks**.
2. Kies **Add endpoint**.
3. Gebruik als endpoint:
   `https://www.rotaractgaasbeek.be/api/stripe-webhook`
4. Selecteer deze gebeurtenissen:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
5. Maak de webhook aan en open daarna de webhookdetails.
6. Kopieer de **Signing secret** die begint met `whsec_`.
7. Voeg in Vercel toe:
   - Key: `STRIPE_WEBHOOK_SECRET`
   - Value: de gekopieerde `whsec_...`-sleutel
   - Environments: Production en Preview

## 4. Google Apps Script bijwerken

1. Vervang de bestaande Apps Script-code door de nieuwste versie uit
   `apps-script/Code.gs`.
2. Voer `setupRacGp` opnieuw uit. Hierdoor wordt het tabblad
   **Ticketbestellingen** toegevoegd aan de bestaande Google Sheet.
3. Ga naar **Implementeren → Implementaties beheren → Bewerken**.
4. Kies **Nieuwe versie** en klik op **Implementeren**.

## 5. Testen en live zetten

1. Push alle websitewijzigingen naar GitHub en wacht op de Vercel-deployment.
2. Test eerst een cinema- en een BBQ-bestelling in Stripe-testmodus.
3. Controleer of de bestelling in het tabblad **Ticketbestellingen** verschijnt.
4. Controleer of na een geslaagde betaling de status **Betaald** wordt en beide
   e-mails aankomen.
5. Zet daarna Stripe in livemodus.
6. Vervang in Vercel `STRIPE_SECRET_KEY` door de live sleutel `sk_live_...`.
7. Maak ook in livemodus dezelfde webhook aan en vervang
   `STRIPE_WEBHOOK_SECRET` door de live `whsec_...`-sleutel.
8. Voer in Vercel een nieuwe deployment uit.

Plaats geheime Stripe-sleutels nooit in GitHub of in de openbare websitecode.
