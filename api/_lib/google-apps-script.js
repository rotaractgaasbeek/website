const callAppsScript = async (payload, webAppUrl, formSecret) => {

  if (!webAppUrl || !formSecret) {
    throw new Error("Google Apps Script is nog niet geconfigureerd.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: formSecret, ...payload }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.message || "De registratie kon niet worden verwerkt.");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
};

const callGoogleAppsScript = (payload) =>
  callAppsScript(
    payload,
    process.env.GOOGLE_APPS_SCRIPT_URL,
    process.env.RALLY_FORM_SECRET,
  );

const callCinemaGoogleAppsScript = (payload) =>
  callAppsScript(
    payload,
    process.env.CINEMA_GOOGLE_APPS_SCRIPT_URL,
    process.env.CINEMA_FORM_SECRET,
  );

module.exports = { callGoogleAppsScript, callCinemaGoogleAppsScript };
