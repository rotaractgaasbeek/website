const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

function structuredData(html) {
  const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, 'JSON-LD ontbreekt');
  return JSON.parse(match[1]);
}

test('club, membership and about pages have distinct search intent and valid structured data', () => {
  const home = read('index.html');
  const contact = read('contact.html');
  const about = read('over-ons.html');
  const organization = structuredData(home)['@graph'].find(item => item['@type'] === 'NGO');

  assert.equal(organization['@id'], 'https://www.rotaractgaasbeek.be/#organization');
  assert.ok(organization.areaServed.includes('Vlaams-Brabant'));
  assert.match(home, /Zoek je een Rotaract-club in Vlaanderen\?/);
  assert.match(home, /fetchpriority="high"/);
  assert.match(contact, /<title>Rotaract lid worden \| Gaasbeek Pajottenland<\/title>/);
  assert.match(contact, /Hoe kan ik lid worden van Rotaract Gaasbeek Pajottenland\?/);
  assert.match(contact, /href="contact\.html\?onderwerp=lid-worden#contactformulier"/);
  assert.equal(structuredData(contact)['@type'], 'ContactPage');
  assert.match(about, /<h2 class="section-title">Wat is Rotaract\?<\/h2>/);
  assert.equal(structuredData(about)['@type'], 'AboutPage');
});

test('the sitemap lists canonical indexable pages and honest modification dates', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(urls.length, 11);
  for (const url of urls) {
    const pathname = new URL(url).pathname;
    const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
    assert.match(read(filename), new RegExp(`<link rel="canonical" href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  }
  assert.equal((sitemap.match(/<lastmod>2026-10-11<\/lastmod>/g) || []).length, 3);
  assert.doesNotMatch(sitemap, /<changefreq>|<priority>|2026-09-16/);
  assert.equal((read('ticket-bedankt.html').match(/<meta name="robots"/g) || []).length, 1);
});
