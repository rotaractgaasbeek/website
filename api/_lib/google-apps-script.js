const callAppsScript = async (payload, webAppUrl, formSecret, options = {}) => {
  if (!webAppUrl || !formSecret) {
    throw new Error("Google Apps Script is nog niet geconfigureerd.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: formSecret, ...payload }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let result = {};

    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        result = {
          ok: false,
          message: `Google Apps Script gaf geen geldige JSON terug (${response.status}).`,
        };
      }
    }

    if (!response.ok || !result.ok) {
      const message =
        result.message ||
        `Google Apps Script gaf status ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
};

const callGoogleAppsScript = (payload, options) =>
  callAppsScript(
    payload,
    process.env.GOOGLE_APPS_SCRIPT_URL,
    process.env.RALLY_FORM_SECRET,
    options,
  );

const callCinemaGoogleAppsScript = (payload, options) =>
  callAppsScript(
    payload,
    process.env.CINEMA_GOOGLE_APPS_SCRIPT_URL,
    process.env.CINEMA_FORM_SECRET,
    options,
  );

module.exports = { callGoogleAppsScript, callCinemaGoogleAppsScript };
