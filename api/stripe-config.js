const hasPublishableKey = (key) => /^pk_(test|live)_/.test(String(key || ""));
const PUBLISHABLE_KEY_NAMES = [
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PUBLIC_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

const getPublishableKey = () => {
  for (const name of PUBLISHABLE_KEY_NAMES) {
    const value = process.env[name];
    if (hasPublishableKey(value)) {
      return { name, value };
    }
  }

  return { name: "", value: "" };
};

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, message: "Methode niet toegestaan." });
  }

  const publishableKey = getPublishableKey();

  return response.status(200).json({
    ok: Boolean(publishableKey.value),
    publishableKey: publishableKey.value,
    configuredVariable: publishableKey.name,
    message: publishableKey.value
      ? ""
      : "Er ontbreekt een publieke Stripe-sleutel in Vercel. Voeg STRIPE_PUBLISHABLE_KEY toe met een pk_test_ of pk_live_ waarde en redeploy.",
  });
};
