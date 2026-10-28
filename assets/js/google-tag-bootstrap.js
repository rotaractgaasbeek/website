// Run synchronously in <head> before the Google tag starts loading.
// Advanced consent mode loads the tag immediately, with consent denied by default.
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
window.gtag("consent", "default", {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
});
window.gtag("set", "ads_data_redaction", true);

window.rotaractGoogleAdsSavedChoice = function () {
  try {
    const stored = JSON.parse(localStorage.getItem("rotaract-google-ads-consent-v1") || "null");
    if (
      (stored?.value === "granted" || stored?.value === "denied") &&
      Number.isFinite(stored.savedAt) &&
      Date.now() - stored.savedAt < 180 * 24 * 60 * 60 * 1000 &&
      stored.savedAt <= Date.now()
    ) return stored.value;
  } catch { /* A blocked storage API leaves consent denied. */ }
  return null;
};

if (window.rotaractGoogleAdsSavedChoice() === "granted") {
  window.gtag("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
}

window.gtag("js", new Date());
window.gtag("config", "AW-18456720108", { allow_ad_personalization_signals: false });
