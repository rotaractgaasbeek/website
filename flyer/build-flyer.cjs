const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

const W = 2480;
const H = 3508;
const root = __dirname;

function dataUri(filePath, mime) {
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function text(x, y, value, options = {}) {
  const {
    size = 36,
    weight = 400,
    fill = "#18212c",
    anchor = "start",
    spacing = 0,
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" fill="${fill}" fill-opacity="${opacity}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${spacing}">${value}</text>`;
}

function lines(x, y, values, options = {}) {
  const { lineHeight = 48, ...textOptions } = options;
  return values.map((value, index) => text(x, y + index * lineHeight, value, textOptions)).join("");
}

function roundedRect(x, y, width, height, radius, fill, stroke = "none", strokeWidth = 0) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function ticket(x, y, width, label, price, options = {}) {
  const {
    fill = "#ffffff",
    color = "#44505d",
    priceColor = "#123c69",
    stroke = "#dfe5eb",
  } = options;
  return [
    roundedRect(x, y, width, 118, 24, fill, stroke, 3),
    text(x + 35, y + 74, label, { size: 35, weight: 800, fill: color }),
    text(x + width - 35, y + 76, price, {
      size: 48,
      weight: 900,
      fill: priceColor,
      anchor: "end",
    }),
  ].join("");
}

async function main() {
  const logo = dataUri(
    path.join(root, "..", "assets", "images", "rotaract-masterbrand-transparent.png"),
    "image/png",
  );
  const qr = dataUri(path.join(root, "rotaractgaasbeek_qrcode.svg"), "image/svg+xml");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="heroSky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f9fc"/>
      <stop offset="1" stop-color="#d9eef7"/>
    </linearGradient>
    <linearGradient id="heroShade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#111820" stop-opacity=".98"/>
      <stop offset=".54" stop-color="#123c69" stop-opacity=".91"/>
      <stop offset=".78" stop-color="#123c69" stop-opacity=".18"/>
      <stop offset="1" stop-color="#123c69" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#123c69"/>
      <stop offset="1" stop-color="#111820"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3b23c"/>
      <stop offset="1" stop-color="#d41367"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#111820" flood-opacity=".14"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- Hero -->
  <rect width="${W}" height="970" fill="url(#heroSky)"/>
  <circle cx="2110" cy="172" r="170" fill="url(#sun)"/>
  <path d="M0 540c310-145 590-171 882-82 345 106 685 53 1022-140 222-127 417-151 576-72v724H0Z" fill="#d9eef7"/>
  <path d="M0 730c460-147 870-137 1232 26 427 194 846 171 1248-67v281H0Z" fill="url(#road)"/>
  <path d="M1040 970l258-448h98l154 448Z" fill="#ffffff" opacity=".27"/>
  <path d="M1440 545h535l118 174h252c75 0 137 45 165 112l47 111H1380l60-397Z" fill="#d41367"/>
  <path d="M1575 400h393c73 0 143 28 197 79l67 63h-729Z" fill="#ffffff"/>
  <circle cx="1610" cy="885" r="118" fill="#111820"/>
  <circle cx="1610" cy="885" r="54" fill="#e5e8ed"/>
  <circle cx="2242" cy="885" r="118" fill="#111820"/>
  <circle cx="2242" cy="885" r="54" fill="#e5e8ed"/>
  <rect x="1902" y="712" width="260" height="48" rx="24" fill="#ffffff" opacity=".88"/>
  <path d="M1500 302c205-106 427-106 666 0" fill="none" stroke="#d41367" stroke-width="28" stroke-linecap="round" opacity=".22"/>
  <rect width="${W}" height="970" fill="url(#heroShade)"/>
  <rect x="2398" width="82" height="970" fill="#d41367"/>

  ${roundedRect(130, 88, 760, 145, 28, "#ffffff")}
  <image href="${logo}" x="160" y="111" width="455" height="86" preserveAspectRatio="xMidYMid meet"/>
  ${text(635, 158, "GAASBEEK", { size: 28, weight: 900, fill: "#18212c", spacing: 1.4 })}
  ${text(635, 193, "PAJOTTENLAND", { size: 25, weight: 700, fill: "#5c6875", spacing: 1.2 })}
  ${roundedRect(130, 280, 550, 78, 39, "#f3b23c")}
  ${text(405, 332, "ZONDAG 6 SEPTEMBER 2026", { size: 31, weight: 900, fill: "#18212c", anchor: "middle", spacing: 2.1 })}
  ${text(130, 585, "RAC GP", { size: 205, weight: 900, fill: "#ffffff", spacing: -7 })}
  ${text(138, 700, "OLDTIMER &amp; GT RALLY", { size: 66, weight: 900, fill: "#f3b23c", spacing: 1.2 })}
  ${lines(138, 815, ["Een rallydag vol rijplezier,", "lekker eten en lokale impact."], { size: 40, weight: 700, fill: "#ffffff", lineHeight: 51, opacity: .95 })}

  <!-- Good cause -->
  ${text(130, 1065, "RAC GP VOOR EEN GOED DOEL", { size: 29, weight: 900, fill: "#d41367", spacing: 3 })}
  ${lines(130, 1153, ["Een mooie dag. Een echte kans", "voor een kind."], { size: 72, weight: 900, fill: "#18212c", lineHeight: 78, spacing: -1.5 })}
  ${lines(130, 1342, [
    "Alle winst gaat naar een internaatsfonds dat kinderen helpt",
    "om op internaat te kunnen, samen met Sint-Jozefscollege Aalst."
  ], { size: 35, weight: 400, fill: "#384452", lineHeight: 49 })}

  ${roundedRect(1650, 1040, 700, 420, 40, "#123c69")}
  ${lines(1720, 1170, ["ALLE WINST", "NAAR HET", "GOEDE DOEL"], { size: 69, weight: 900, fill: "#ffffff", lineHeight: 70, spacing: -1.5 })}

  <!-- Key locations -->
  ${text(130, 1555, "PRAKTISCH", { size: 29, weight: 900, fill: "#d41367", spacing: 3 })}
  ${text(130, 1635, "De twee locaties die je moet kennen", { size: 55, weight: 900, fill: "#18212c", spacing: -1 })}

  ${roundedRect(130, 1715, 820, 570, 40, "#f4f7fa", "#dfe5eb", 3)}
  ${text(200, 1815, "RALLYDEELNEMERS", { size: 28, weight: 900, fill: "#5c6875", spacing: 2.5 })}
  ${text(200, 1935, "8u", { size: 94, weight: 900, fill: "#123c69" })}
  ${lines(200, 2040, ["Ontbijt &amp;", "ontvangst"], { size: 55, weight: 900, fill: "#18212c", lineHeight: 60 })}
  ${text(200, 2195, "LINDEMANS", { size: 43, weight: 900, fill: "#d41367", spacing: 1.5 })}
  ${text(200, 2245, "in Lennik", { size: 33, weight: 700, fill: "#5c6875" })}

  <g filter="url(#shadow)">
    ${roundedRect(990, 1715, 1360, 570, 40, "#123c69")}
  </g>
  ${text(1060, 1815, "OOK ZONDER RALLYWAGEN WELKOM", { size: 28, weight: 900, fill: "#f3b23c", spacing: 2.2 })}
  ${text(1060, 1935, "BBQ", { size: 100, weight: 900, fill: "#ffffff", spacing: -2 })}
  ${text(1060, 2048, "GRAVENHOF", { size: 98, weight: 900, fill: "#f3b23c", spacing: -2 })}
  ${text(1060, 2125, "in Beersel", { size: 38, weight: 700, fill: "#ffffff" })}
  ${text(1060, 2180, "vanaf 18u", { size: 42, weight: 700, fill: "#ffffff" })}
  ${roundedRect(1985, 1830, 275, 300, 30, "#f3b23c")}
  ${text(2122, 1950, "€100", { size: 73, weight: 900, fill: "#18212c", anchor: "middle" })}
  ${lines(2122, 2020, ["ENKEL", "BBQ"], { size: 32, weight: 900, fill: "#18212c", anchor: "middle", lineHeight: 38, spacing: 1.8 })}

  <!-- Prices -->
  ${text(130, 2390, "DEELNEMEN", { size: 29, weight: 900, fill: "#d41367", spacing: 3 })}
  ${text(130, 2470, "Kies jouw formule", { size: 55, weight: 900, fill: "#18212c", spacing: -1 })}
  ${ticket(130, 2530, 700, "Bestuurder", "€230")}
  ${ticket(870, 2530, 700, "Bijrijder", "€210")}
  ${ticket(1610, 2530, 740, "Enkel BBQ", "€100", { fill: "#fff4cf", color: "#18212c", priceColor: "#18212c", stroke: "#f3b23c" })}

  <!-- CTA -->
  ${roundedRect(130, 2740, 2220, 630, 42, "#18212c")}
  ${text(205, 2845, "INSCHRIJVEN &amp; MEER INFO", { size: 29, weight: 900, fill: "#f3b23c", spacing: 3 })}
  ${lines(205, 2960, ["Scan de QR-code", "of stuur ons een mail."], { size: 72, weight: 900, fill: "#ffffff", lineHeight: 78, spacing: -1.4 })}
  ${text(205, 3195, "rotaractgaasbeek@gmail.com", { size: 40, weight: 900, fill: "#ffffff" })}

  ${roundedRect(1810, 2795, 450, 515, 34, "#ffffff")}
  <image href="${qr}" x="1850" y="2835" width="370" height="370"/>
  ${text(2035, 3255, "SCAN VOOR ALLE INFO", { size: 27, weight: 900, fill: "#18212c", anchor: "middle", spacing: 1.5 })}

  <rect x="0" y="3482" width="1116" height="26" fill="#d41367"/>
  <rect x="1116" y="3482" width="546" height="26" fill="#f3b23c"/>
  <rect x="1662" y="3482" width="818" height="26" fill="#123c69"/>
</svg>`;

  const svgPath = path.join(root, "rotaract-rally-flyer-a4.svg");
  const pngPath = path.join(root, "rotaract-rally-flyer-a4.png");
  const pdfPath = path.join(root, "rotaract-rally-flyer-a4.pdf");

  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);

  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(fs.readFileSync(pngPath));
  const page = pdf.addPage([595.276, 841.89]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  fs.writeFileSync(pdfPath, await pdf.save());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
