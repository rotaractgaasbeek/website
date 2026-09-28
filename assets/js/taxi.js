(() => {
  const form = document.querySelector('[data-taxi-form]');
  if (!form) return;

  const calculateButton = form.querySelector('[data-taxi-calculate]');
  const submitButton = form.querySelector('[type="submit"]');
  const estimateStatus = form.querySelector('[data-taxi-estimate-status]');
  const estimatePanel = form.querySelector('[data-taxi-estimate]');
  const status = form.querySelector('[data-taxi-status]');
  const routeFields = [...form.querySelectorAll('[data-taxi-route]')];
  const trip = form.elements.trip;
  const currency = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });
  const distance = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 });
  let quoteToken = '';
  let quoteVersion = 0;
  let quoteController;
  let submitting = false;
  let requestId = crypto.randomUUID();
  try {
    requestId = sessionStorage.getItem('taxi-booking-request') || requestId;
    sessionStorage.setItem('taxi-booking-request', requestId);
  } catch { /* Booking still works when storage is disabled. */ }

  const invalidateQuote = () => {
    quoteVersion += 1;
    quoteController?.abort();
    quoteToken = '';
    estimatePanel.hidden = true;
    estimatePanel.replaceChildren();
    estimateStatus.textContent = '';
    estimateStatus.className = 'form-status';
    calculateButton.disabled = false;
    calculateButton.textContent = 'Bereken mijn geschatte prijs';
  };
  routeFields.forEach(field => field.addEventListener('input', invalidateQuote));
  trip.addEventListener('change', invalidateQuote);

  const request = async (url, payload, signal) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'De dienst is tijdelijk niet bereikbaar. Probeer opnieuw of mail info@rotaractgaasbeek.be.');
    }
    return result;
  };

  const renderEstimate = (quote) => {
    const list = document.createElement('dl');
    list.className = 'taxi-quote-list';
    quote.legs.forEach(leg => {
      const row = document.createElement('div');
      const label = document.createElement('dt');
      const value = document.createElement('dd');
      label.textContent = `${leg.label} · ${distance.format(leg.meters / 1000)} km`;
      value.textContent = currency.format(leg.cents / 100);
      row.append(label, value);
      list.append(row);
    });
    const address = document.createElement('p');
    address.textContent = `Herken je dit adres? ${quote.resolvedAddress}`;
    const total = document.createElement('p');
    total.className = 'taxi-quote-total';
    total.textContent = `Geschat totaal voor je groep: ${currency.format(quote.totalCents / 100)}`;
    const source = document.createElement('p');
    source.className = 'form-note';
    source.textContent = 'Rijafstand: Google Maps. Controleer het herkende adres. Deze raming is geen vaste eindprijs.';
    estimatePanel.replaceChildren(address, list, total, source);
    if (trip.value === 'home-morning') {
      const note = document.createElement('p');
      note.className = 'form-note';
      note.textContent = 'De ochtendrit wordt tegen dezelfde vergoeding als de thuisrit geraamd. Ook een eventuele toeslag van de avond voordien geldt opnieuw.';
      estimatePanel.append(note);
    }
    if (quote.sameDay) {
      const note = document.createElement('p');
      note.textContent = 'Je boekt op de dag zelf: boven op deze raming geldt een toeslag die we vóór vertrek afspreken. Vooraf geboekte ritten krijgen voorrang.';
      estimatePanel.append(note);
    }
    estimatePanel.hidden = false;
  };

  calculateButton.addEventListener('click', async () => {
    if (submitting) return;
    if (routeFields.some(field => !field.reportValidity())) return;
    invalidateQuote();
    const version = quoteVersion;
    quoteController = new AbortController();
    calculateButton.disabled = true;
    calculateButton.textContent = 'Rijafstand berekenen…';
    estimateStatus.textContent = 'Google Maps berekent je route…';
    const payload = Object.fromEntries(routeFields.map(field => [field.name, field.value]));
    try {
      const result = await request('/api/taxi-estimate', payload, quoteController.signal);
      if (version !== quoteVersion) return;
      quoteToken = result.quote.token;
      renderEstimate(result.quote);
      estimateStatus.textContent = '';
    } catch (error) {
      if (version !== quoteVersion || error.name === 'AbortError') return;
      estimateStatus.textContent = `${error.message} Je kunt je wel inschrijven zonder prijsraming; we spreken de prijs dan met je af.`;
      estimateStatus.classList.add('form-status--error');
    } finally {
      if (version === quoteVersion) {
        calculateButton.disabled = false;
        calculateButton.textContent = 'Bereken mijn geschatte prijs';
      }
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const payload = { ...Object.fromEntries(new FormData(form)), requestId, quoteToken };
    submitting = true;
    quoteController?.abort();
    quoteVersion += 1;
    estimateStatus.textContent = '';
    const enabledFields = [...form.querySelectorAll('input, select, textarea, button')].filter(field => !field.disabled);
    enabledFields.forEach(field => { field.disabled = true; });
    submitButton.textContent = 'Boeking versturen…';
    status.textContent = '';
    status.className = 'form-status';
    try {
      const result = await request(form.action, payload);
      if (!result.id) throw new Error('Je boeking is niet bevestigd. Neem contact op via info@rotaractgaasbeek.be.');
      status.textContent = `Je definitieve inschrijving is ontvangen. Boekingsnummer: ${result.id}. ` +
        (result.emailSent
          ? 'De ontvangstbevestiging is per e-mail verstuurd. Controleer ook je spammap.'
          : 'Je boeking is opgeslagen, maar de ontvangstmail is nog niet verstuurd. Bewaar je boekingsnummer en neem bij vragen contact op met info@rotaractgaasbeek.be.') +
        (result.estimatePending ? ' De ritprijs spreken we nog met je af.' : ' De prijsraming blijft een schatting.') +
        (result.sameDay ? ' Voor deze aanvraag op de dag zelf geldt een toeslag.' : '');
      submitButton.textContent = 'Inschrijving ontvangen';
      try { sessionStorage.removeItem('taxi-booking-request'); } catch { /* Optional storage. */ }
    } catch (error) {
      status.textContent = `${error.message} Je gegevens blijven ingevuld; je kunt veilig opnieuw proberen.`;
      status.classList.add('form-status--error');
      enabledFields.forEach(field => { field.disabled = false; });
      calculateButton.disabled = false;
      calculateButton.textContent = 'Bereken mijn geschatte prijs';
      submitButton.textContent = 'Opnieuw proberen';
      submitting = false;
    }
  });
})();
