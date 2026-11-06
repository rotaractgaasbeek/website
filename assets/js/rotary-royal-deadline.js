(() => {
  const closesAt = Date.parse("2026-11-19T00:00:00+01:00");
  if (Date.now() >= closesAt) return;

  const popup = document.createElement("dialog");
  if (typeof popup.showModal !== "function") return;

  popup.className = "site-dialog deadline-popup";
  popup.setAttribute("aria-labelledby", "deadline-popup-title");
  popup.setAttribute("aria-describedby", "deadline-popup-description");
  popup.innerHTML = `
    <form method="dialog">
      <button class="site-dialog__close" type="submit" aria-label="Melding sluiten" autofocus>×</button>
    </form>
    <p class="eyebrow">Taxi Service voor Rotary Royal</p>
    <h2 class="section-title" id="deadline-popup-title">Inschrijven tot en met <time datetime="2026-11-18">18 november</time></h2>
    <p id="deadline-popup-description">Boek je taxi voor Rotary Royal op 20 november 2026 in Krekelhof Gooik.</p>
    <a class="button button--primary" href="#inschrijven">Schrijf je in</a>
  `;
  popup.querySelector("a").addEventListener("click", () => popup.close());
  document.body.append(popup);
  popup.showModal();
})();
