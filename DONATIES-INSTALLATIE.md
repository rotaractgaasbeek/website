# Online giften activeren

De website toont op **Onze impact** een steunsectie. De knop op **Home** brengt bezoekers daarheen. Zolang er geen geldige Stripe-donatielink is ingesteld, staat er op Onze impact eerlijk dat online doneren nog niet beschikbaar is. Er worden dan geen betalingen aangenomen.

## 1. Maak de donatielink in Stripe

1. Meld aan in het Stripe-account van **Rotaract Club Gaasbeek Pajottenland VZW**.
2. Ga naar **Payment Links / Betaallinks** en kies **Create payment link / Betaallink maken**.
3. Kies **Customers choose what to pay / Klant kiest het bedrag**. Dit is een **eenmalige** gift met een bedrag naar keuze.
4. Gebruik bijvoorbeeld als titel **Steun Rotaract Gaasbeek Pajottenland** en als omschrijving: **Je vrije gift ondersteunt onze volgende lokale serviceprojecten.** Kies **EUR**. Een voorgesteld bedrag of minimum is optioneel.
5. Kies bij de geavanceerde opties de knoptekst **Donate / Doneren**. Controleer in de betaalmethoden van het Stripe-account of **Bancontact** en kaarten actief zijn en bekijk hoe de link eruitziet op mobiel.
6. Maak de link aan en kopieer de volledige URL. Een Stripe-donatielink begint doorgaans met `https://donate.stripe.com/` of `https://buy.stripe.com/`. Kopieer **geen** geheime API-sleutel.

Stripe-uitleg: [donaties via Payment Links](https://support.stripe.com/questions/how-to-accept-donations-through-stripe?locale=nl-NL).

## 2. Zet de automatische e-mail aan

1. Ga in Stripe naar **Settings / Instellingen → Business → Customer emails / E-mails aan klanten**.
2. Zet onder betalingen **Successful payments / Geslaagde betalingen** aan. Stripe mailt dan na een geslaagde betaling automatisch een betaalbewijs naar het e-mailadres van de schenker. Mislukte betalingen krijgen geen betaalbewijs.
3. Controleer onder **Branding → Email receipts / E-mailbetaalbewijzen** het logo, de kleur en de publieke contactgegevens van de VZW.

**Let op:** deze Stripe-instelling geldt voor het hele Stripe-account, dus ook voor eventuele ticketbetalingen via hetzelfde account. Stripe verstuurt automatische betaalbewijzen niet voor testbetalingen; controleer de e-mail na activatie met een kleine echte betaling als je dat wilt testen. Het betaalbewijs is **geen fiscaal attest**.

Stripe-uitleg: [automatische betaalbewijzen en opmaak](https://docs.stripe.com/receipts).

## 3. Verbind de link met de website

1. Open in Vercel het project van de website.
2. Ga naar **Settings → Environment Variables**.
3. Voeg toe:
   - **Name:** `STRIPE_DONATION_LINK`
   - **Value:** de volledige donatielink uit stap 1
   - **Environment:** **Production** (en eventueel **Preview** met een Stripe-testlink)
4. Sla op en start een **nieuwe deployment**. De knop **Doneer een bedrag naar keuze** verschijnt dan automatisch op `impact.html#steun-ons` en leidt rechtstreeks naar jullie Stripe-betaalpagina.

Gebruik in Production geen `test_`-link. De website accepteert alleen links op de officiële Stripe-hostnamen `buy.stripe.com` en `donate.stripe.com`.

## 4. Controleer na activatie

- Open Home en klik op **Steun ons**; je moet bij de steunsectie op Onze impact landen.
- Klik op **Doneer een bedrag naar keuze** en controleer de naam van de VZW, de vrije bedragkeuze en de beschikbare betaalmethoden. Rond alleen een betaling af als je die bewust wilt uitvoeren.
- Controleer in het Stripe-dashboard de geslaagde gift en in de inbox van de schenker het betaalbewijs. Kijk zo nodig ook in spam.
- Wil je op de Stripe-bevestigingspagina een persoonlijke danktekst tonen? Pas in de betaallink **After the payment / Na de betaling** aan. Een aparte persoonlijke dankmail buiten het standaard Stripe-betaalbewijs vraagt een extra e-mailkoppeling.

Stripe-uitleg: [na betaling via een betaallink](https://docs.stripe.com/payment-links/post-payment).
