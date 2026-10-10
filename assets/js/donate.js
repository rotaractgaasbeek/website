(() => {
  const link = document.querySelector("[data-donation-link]");
  const pending = document.querySelector("[data-donation-pending]");
  if (!link || !pending) return;

  fetch("/api/donate?status=1", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => {
      if (!status?.available) return;
      link.hidden = false;
      pending.hidden = true;
    })
    .catch(() => {
      // Keep the honest unavailable message if the donation endpoint cannot be reached.
    });
})();
