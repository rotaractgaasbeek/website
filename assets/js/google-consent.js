(() => {
  "use strict";

  const tagId = "AW-18456720108";
  // Google Ads: Leadformulier indienen. Alleen versturen na bevestigde contactmail.
  const contactConversionLabel = "IB_UCILo3pgdEOzl7OBE";
  const storageKey = "rotaract-google-ads-consent-v1";
  const denied = {
    ad_storage: "denied", ad_user_data: "denied",
    ad_personalization: "denied", analytics_storage: "denied",
  };

  function savedChoice() {
    return window.rotaractGoogleAdsSavedChoice?.() || null;
  }

  function storeChoice(value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ value, savedAt: Date.now() }));
    } catch { /* Consent still applies to this page if storage is unavailable. */ }
  }

  let choice = savedChoice();

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
  banner.setAttribute("aria-label", "Keuze voor advertentiecookies");
  banner.innerHTML = `
    <div class="cookie-banner__text">
      <h2>Advertentiecookies toestaan?</h2>
      <p>De Google Ads-tag laadt meteen en kan ook zonder toestemming beperkte signalen zonder advertentiecookies naar Google sturen. Met jouw toestemming mag Google advertentiecookies gebruiken om onze advertenties te meten. We gebruiken deze keuze niet voor gepersonaliseerde advertenties. <a href="privacy.html">Lees ons cookiebeleid</a>.</p>
    </div>
    <div class="cookie-banner__actions">
      <button class="cookie-banner__button cookie-banner__button--secondary" type="button" data-cookie-deny>Geen advertentiecookies</button>
      <button class="cookie-banner__button cookie-banner__button--primary" type="button" data-cookie-allow>Meting toestaan</button>
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
      window.gtag?.("consent", "update", {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "denied",
        analytics_storage: "denied",
      });
    } else {
      window.gtag?.("consent", "update", denied);
    }
    if (previous === "granted" && value === "denied") window.location.reload();
    else settings.focus();
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
