(() => {
  "use strict";

  const tagId = "AW-18456720108";
  // Vul de conversielabel van de handmatige Google Ads-actie hier in.
  // Alleen de globale tag-ID is niet genoeg om een contactconversie te registreren.
  const contactConversionLabel = "";
  const storageKey = "rotaract-google-ads-consent-v1";
  const maxChoiceAge = 180 * 24 * 60 * 60 * 1000;
  const denied = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  };

  function savedChoice() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        (stored?.value === "granted" || stored?.value === "denied") &&
        Number.isFinite(stored.savedAt) &&
        Date.now() - stored.savedAt < maxChoiceAge &&
        stored.savedAt <= Date.now()
      ) return stored.value;
    } catch { /* A blocked storage API must not load the Ads tag. */ }
    return null;
  }

  function storeChoice(value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value, savedAt: Date.now() }));
    } catch { /* Consent still applies to this page if storage is unavailable. */ }
  }

  function enableAds() {
    if (document.querySelector("script[data-rotaract-google-ads]")) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", denied);
    window.gtag("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", tagId, { allow_ad_personalization_signals: false });

    const script = document.createElement("script");
    script.async = true;
    script.dataset.rotaractGoogleAds = "";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${tagId}`;
    document.head.append(script);
  }

  let choice = savedChoice();
  if (choice === "granted") enableAds();

  window.rotaractTrackContactConversion = function () {
    if (choice !== "granted" || !contactConversionLabel || typeof window.gtag !== "function") return;
    window.gtag("event", "conversion", {
      send_to: `${tagId}/${contactConversionLabel}`,
    });
  };

  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "cookie-settings-link";
  settings.textContent = "Cookiekeuze aanpassen";
  const footerLinks = document.querySelector(".site-footer .footer-links:last-child");
  if (footerLinks) {
    footerLinks.append(settings);
  } else {
    settings.classList.add("cookie-settings-link--floating");
    document.body.append(settings);
  }
  settings.hidden = choice === null;

  const banner = document.createElement("section");
  banner.className = "cookie-banner";
  banner.setAttribute("aria-label", "Keuze voor meetcookies");
  banner.innerHTML = `
    <div class="cookie-banner__text">
      <h2>Mag Rotaract meetcookies gebruiken?</h2>
      <p>Met jouw toestemming laden we Google Ads en kunnen meetcookies worden geplaatst. Zo zien we hoe onze advertenties werken, bijvoorbeeld of ze leiden tot een verstuurd contactformulier. Zonder toestemming laden we Google Ads niet. We delen geen formulierinhoud en gebruiken geen advertentiepersonalisatie. Je kunt je keuze later aanpassen; we onthouden die maximaal 180 dagen. <a href="privacy.html">Lees ons cookiebeleid</a>.</p>
    </div>
    <div class="cookie-banner__actions">
      <button class="cookie-banner__button" type="button" data-cookie-deny>Alleen noodzakelijke cookies</button>
      <button class="cookie-banner__button" type="button" data-cookie-allow>Meetcookies toestaan</button>
      <button class="cookie-banner__close" type="button" data-cookie-close aria-label="Cookiekeuze sluiten" hidden>Sluiten</button>
    </div>
  `;
  banner.hidden = true;
  document.body.append(banner);
  const close = banner.querySelector("[data-cookie-close]");

  function showBanner() {
    close.hidden = choice === null;
    banner.hidden = false;
  }

  function choose(value) {
    const previous = choice;
    choice = value;
    storeChoice(value);
    banner.hidden = true;
    settings.hidden = false;
    if (value === "granted") {
      enableAds();
      settings.focus();
    } else if (previous === "granted") {
      window.gtag?.("consent", "update", denied);
      window.location.reload();
    } else {
      settings.focus();
    }
  }

  banner.querySelector("[data-cookie-deny]").addEventListener("click", () => choose("denied"));
  banner.querySelector("[data-cookie-allow]").addEventListener("click", () => choose("granted"));
  close.addEventListener("click", () => {
    banner.hidden = true;
    settings.focus();
  });
  settings.addEventListener("click", () => {
    showBanner();
    banner.querySelector("[data-cookie-deny]").focus();
  });

  if (choice === null) showBanner();
})();
