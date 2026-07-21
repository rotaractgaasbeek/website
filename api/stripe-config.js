module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, message: "Methode niet toegestaan." });
  }

  return response.status(200).json({
    ok: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  });
};
