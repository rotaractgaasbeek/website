const body = document.body;
const navToggle = document.querySelector("[data-nav-toggle]");
const navLinks = document.querySelector("[data-nav-links]");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const currentPage = window.location.pathname.split("/").pop() || "index.html";
const eventDetailPages = new Set(["rally.html", "openluchtcinema.html"]);
document.querySelectorAll(".nav__link").forEach((link) => {
  const href = link.getAttribute("href");
  if (href === currentPage || (href === "events.html" && eventDetailPages.has(currentPage))) {
    link.setAttribute("aria-current", "page");
  }
});

document.querySelectorAll("[data-calendar-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.getAttribute("data-calendar-filter");

    document.querySelectorAll("[data-calendar-filter]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });

    document.querySelectorAll("[data-calendar-item]").forEach((item) => {
      const type = item.getAttribute("data-calendar-item");
      item.hidden = filter !== "alles" && type !== filter;
    });
  });
});

const contactForm = document.querySelector("[data-contact-form]");

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const subject = String(formData.get("subject") || "Vraag via website");
    const message = String(formData.get("message") || "");

    const bodyText = [
      `Naam: ${name}`,
      `E-mail: ${email}`,
      "",
      message,
    ].join("\n");

    const mailto = new URL("mailto:rotaractgaasbeek@gmail.com");
    mailto.searchParams.set("subject", subject);
    mailto.searchParams.set("body", bodyText);
    window.location.href = mailto.toString();
  });
}
