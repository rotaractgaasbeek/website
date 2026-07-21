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

const calendarTitle = document.querySelector("[data-calendar-title]");
const calendarBoard = document.querySelector("[data-calendar-board]");
const calendarAgenda = document.querySelector("[data-calendar-agenda]");
const calendarPrev = document.querySelector("[data-calendar-prev]");
const calendarNext = document.querySelector("[data-calendar-next]");

const monthNames = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December",
];

const fixedCalendarItems = [
  {
    title: "Kidsday",
    date: "2026-05-25",
    label: "Afgelopen event",
    description: "Een toffe feestdag met kinderen die opgroeien in kwetsbare omstandigheden.",
    time: "Overdag",
    location: "Wordt meegedeeld aan deelnemers",
  },
  {
    title: "Openluchtcinema",
    date: "2026-08-16",
    label: "Opkomend event",
    description: "Een filmavond in open lucht in de Dekenijtuin in Lennik.",
    time: "Vanaf 19u",
    location: "Dekenijtuin in Lennik",
    href: "openluchtcinema.html",
  },
  {
    title: "RAC GP",
    date: "2026-09-06",
    label: "Opkomend event",
    description: "Klassevolle rallydag voor oldtimers en GT-wagens, met ontbijt, stops, lunch en BBQ aan Gravenhof in Beersel.",
    time: "Vanaf 8u",
    location: "Sfeervolle locaties in de omgeving, met BBQ aan Gravenhof in Beersel",
    href: "rally.html",
  },
];

let visibleCalendarDate = new Date(2026, 4, 1);

function getThirdFriday(year, month) {
  let fridayCount = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    if (date.getDay() === 5) {
      fridayCount += 1;
      if (fridayCount === 3) return day;
    }
  }

  return 1;
}

function parseCalendarDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getCalendarItems(year, month) {
  const thirdFriday = getThirdFriday(year, month);
  const items = [
    {
      title: "Maandelijkse bijeenkomst",
      date: `${year}-${String(month + 1).padStart(2, "0")}-${String(thirdFriday).padStart(2, "0")}`,
      description: "Clubwerking, projectupdates en nieuwe plannen.",
      time: "20u",
      location: "Steenpoel Golf Club",
    },
  ];

  fixedCalendarItems.forEach((item) => {
    if (item.date) {
      const date = parseCalendarDate(item.date);
      if (date.getFullYear() === year && date.getMonth() === month) items.push(item);
      return;
    }

    if (item.year === year && item.month === month) items.push(item);
  });

  return items.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return parseCalendarDate(a.date) - parseCalendarDate(b.date);
  });
}

function renderCalendar() {
  if (!calendarTitle || !calendarBoard || !calendarAgenda) return;

  const year = visibleCalendarDate.getFullYear();
  const month = visibleCalendarDate.getMonth();
  const monthItems = getCalendarItems(year, month);
  const eventDays = new Set(
    monthItems
      .filter((item) => item.date)
      .map((item) => parseCalendarDate(item.date).getDate())
  );

  calendarTitle.textContent = `${monthNames[month]} ${year}`;
  calendarBoard.innerHTML = "";

  ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].forEach((day) => {
    const item = document.createElement("span");
    item.className = "weekday";
    item.textContent = day;
    calendarBoard.append(item);
  });

  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();

  for (let i = startOffset; i > 0; i -= 1) {
    const item = document.createElement("span");
    item.className = "is-muted";
    item.textContent = String(previousMonthDays - i + 1);
    calendarBoard.append(item);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const item = eventDays.has(day) ? document.createElement("button") : document.createElement("span");
    item.textContent = String(day);
    if (eventDays.has(day)) {
      item.type = "button";
      item.className = "is-event";
      item.setAttribute("aria-label", `Event op ${day} ${monthNames[month]} ${year}`);
    }
    calendarBoard.append(item);
  }

  const totalCells = calendarBoard.children.length - 7;
  const nextCells = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= nextCells; day += 1) {
    const item = document.createElement("span");
    item.className = "is-muted";
    item.textContent = String(day);
    calendarBoard.append(item);
  }

  calendarAgenda.innerHTML = "";
  monthItems.forEach((item) => {
    const article = document.createElement("article");
    article.className = "agenda-item";
    const date = item.date ? parseCalendarDate(item.date) : null;
    const dayText = date ? String(date.getDate()) : item.dayLabel;
    const monthText = date ? monthNames[date.getMonth()].slice(0, 3).toLowerCase() : "2026";
    const title = item.href ? `<a href="${item.href}">${item.title}</a>` : item.title;
    const label = item.label ? `<span class="tag">${item.label}</span>` : "";

    article.innerHTML = `
      <div class="agenda-item__date"><span>${dayText}<small>${monthText}</small></span></div>
      <div>
        ${label}
        <h3>${title}</h3>
        <p>${item.description}</p>
        <dl class="agenda-meta"><div><dt>Uur</dt><dd>${item.time}</dd></div><div><dt>Plaats</dt><dd>${item.location}</dd></div></dl>
      </div>
    `;
    calendarAgenda.append(article);
  });
}

if (calendarPrev && calendarNext) {
  calendarPrev.addEventListener("click", () => {
    visibleCalendarDate = new Date(visibleCalendarDate.getFullYear(), visibleCalendarDate.getMonth() - 1, 1);
    renderCalendar();
  });

  calendarNext.addEventListener("click", () => {
    visibleCalendarDate = new Date(visibleCalendarDate.getFullYear(), visibleCalendarDate.getMonth() + 1, 1);
    renderCalendar();
  });

  renderCalendar();
}

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

const rallyForm = document.querySelector("[data-rally-form]");

if (rallyForm) {
  const participation = rallyForm.querySelector("[data-participation]");
  const carFields = [...rallyForm.querySelectorAll("[data-car-field]")];
  const submitButton = rallyForm.querySelector('button[type="submit"]');
  const formStatus = rallyForm.querySelector("[data-form-status]");

  const updateCarRequirements = () => {
    const isRally = !participation || participation.value !== "Enkel BBQ";

    carFields.forEach((field) => {
      field.required = isRally;
      field.disabled = !isRally;
    });
  };

  participation?.addEventListener("change", updateCarRequirements);
  updateCarRequirements();

  rallyForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!rallyForm.reportValidity()) {
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Bezig met verzenden...";
    formStatus.textContent = "";
    formStatus.className = "form-status";

    try {
      const payload = Object.fromEntries(new FormData(rallyForm).entries());
      const response = await fetch(rallyForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "De aanvraag kon niet worden verzonden.");
      }

      window.location.href = "rally-bedankt.html";
    } catch (error) {
      formStatus.textContent =
        error.message ||
        "De aanvraag kon niet worden verzonden. Probeer later opnieuw.";
      formStatus.classList.add("form-status--error");
      submitButton.disabled = false;
      submitButton.textContent = "Opnieuw proberen";
    }
  });
}

const ticketPrices = {
  bbq: { bbqQuantity: 10000 },
  cinema: {
    ratatouilleAdultQuantity: 1600,
    ratatouilleChildQuantity: 1200,
    ratatouilleGiftQuantity: 1200,
    orientAdultQuantity: 1600,
    orientChildQuantity: 1200,
    orientGiftQuantity: 1200,
  },
};

document.querySelectorAll("[data-ticket-form]").forEach((ticketForm) => {
  const eventType = ticketForm.dataset.ticketEvent;
  const quantities = [...ticketForm.querySelectorAll("[data-ticket-quantity]")];
  const totalOutput = ticketForm.querySelector("[data-ticket-total]");
  const status = ticketForm.querySelector("[data-ticket-status]");
  const submitButton = ticketForm.querySelector('button[type="submit"]');

  const updateTicketTotal = () => {
    const total = quantities.reduce((sum, input) => {
      const quantity = Math.max(0, Number.parseInt(input.value, 10) || 0);
      return sum + quantity * (ticketPrices[eventType]?.[input.name] || 0);
    }, 0);

    totalOutput.textContent = new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: "EUR",
    }).format(total / 100);
  };

  const resetSubmitButton = () => {
    submitButton.disabled = false;
    submitButton.textContent = "Ga naar betaalpagina";
  };

  quantities.forEach((input) => {
    input.addEventListener("input", () => {
      updateTicketTotal();
      resetSubmitButton();
    });
  });
  ticketForm
    .querySelectorAll('input[name="name"], input[name="email"], input[name="phone"]')
    .forEach((input) => input.addEventListener("input", resetSubmitButton));
  ticketForm
    .querySelectorAll('input[name="paymentMethod"]')
    .forEach((input) => input.addEventListener("change", resetSubmitButton));
  updateTicketTotal();

  ticketForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!ticketForm.reportValidity()) {
      return;
    }

    const payload = Object.fromEntries(new FormData(ticketForm).entries());
    payload.event = eventType;
    const totalQuantity = quantities.reduce(
      (sum, input) => sum + Math.max(0, Number.parseInt(input.value, 10) || 0),
      0,
    );

    if (totalQuantity < 1) {
      status.textContent = "Kies minstens één ticket.";
      status.className = "form-status form-status--error";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Betaalpagina openen...";
    status.textContent = "";
    status.className = "form-status";

    try {
      const response = await fetch(ticketForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok || !result.url) {
        throw new Error(result.message || "De betaling kon niet worden gestart.");
      }

      window.location.href = result.url;
    } catch (error) {
      status.textContent =
        error.message || "De betaling kon niet worden gestart. Probeer later opnieuw.";
      status.classList.add("form-status--error");
      submitButton.disabled = false;
      submitButton.textContent = "Opnieuw proberen";
    }
  });
});

if (new URLSearchParams(window.location.search).get("betaling") === "geannuleerd") {
  const ticketStatus = document.querySelector("[data-ticket-status]");
  if (ticketStatus) {
    ticketStatus.textContent =
      "De betaling werd geannuleerd. Er is niets aangerekend; je kunt opnieuw proberen.";
    ticketStatus.className = "form-status form-status--error";
  }
}
