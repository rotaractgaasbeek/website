const ALLOWED_HOSTS = new Set(["buy.stripe.com", "donate.stripe.com"]);

function getDonationLink(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());
    if (
      url.protocol !== "https:" ||
      !ALLOWED_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname === "/"
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    response.statusCode = 405;
    return response.end("Methode niet toegestaan.");
  }

  const link = getDonationLink(process.env.STRIPE_DONATION_LINK);
  const statusRequest = new URL(request.url, "http://localhost").searchParams.has("status");

  if (statusRequest) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    return response.end(request.method === "HEAD" ? undefined : JSON.stringify({ available: Boolean(link) }));
  }

  if (link) {
    response.statusCode = 302;
    response.setHeader("Location", link);
    response.setHeader("Referrer-Policy", "no-referrer");
    return response.end();
  }

  response.statusCode = 503;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  return response.end(request.method === "HEAD" ? undefined :
    '<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Online doneren nog niet beschikbaar</title><body style="font:1rem/1.5 system-ui;max-width:36rem;margin:3rem auto;padding:0 1rem"><h1>Online doneren is nog niet beschikbaar</h1><p>De betaalpagina wordt nog gekoppeld. Je kunt ons intussen mailen op <a href="mailto:info@rotaractgaasbeek.be">info@rotaractgaasbeek.be</a>.</p><p><a href="/impact.html#steun-ons">Terug naar Onze impact</a></p></body></html>');
}

module.exports = handler;
module.exports.getDonationLink = getDonationLink;
