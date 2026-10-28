// Run synchronously in <head> before the consent banner and any Google tag.
// Basic consent mode: this queues a denied default but sends nothing to Google.
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
window.gtag("consent", "default", {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
});
window.gtag("js", new Date());
