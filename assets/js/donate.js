(() => {
  const link = document.querySelector("[data-donation-link]");
  const pending = document.querySelector("[data-donation-pending]");
  if (!link || !pending) return;

  fetch("/api/donate?status=1", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => {
      if (status?.available !== false) return;
      link.hidden = true;
      pending.hidden = false;
    })
    .catch(() => {
      // Keep the link usable; the server still shows a clear fallback if Stripe is unavailable.
    });
})();
