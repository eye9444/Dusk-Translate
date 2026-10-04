import { initializePaddle } from '@paddle/paddle-js';

import { PRICING_TIERS, getPricingTiers } from './pricing-tiers.js';

function requiredPublicEnv(name) {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is required. Add it to your environment before opening pricing.`);
  return value;
}

function buildCards(root, onSubscribe) {
  const fragment = document.createDocumentFragment();
  const paid = document.createElement('article');
  paid.className = 'pricing-card pricing-paid';
  paid.innerHTML = '<h2>Choose your paid plan</h2><p>One subscription per person. Each collaborator chooses their own plan.</p><div class="pricing-plan-toggle" role="group" aria-label="Paid plan"></div>';
  const toggle = paid.querySelector('.pricing-plan-toggle');
  for (const tier of PRICING_TIERS) {
    const free = tier.name === 'Starter';
    const card = document.createElement(free ? 'article' : 'section');
    card.className = free ? 'pricing-card' : 'pricing-plan';
    card.dataset.tier = tier.name;
    card.hidden = !free && tier.name !== 'Pro';
    card.innerHTML = `
      <h2>${tier.name}</h2>
      <p class="pricing-card-description"></p>
      <p class="pricing-price" data-price-for="${tier.name}">Loading price...</p>
      <p class="pricing-period" data-period-for="${tier.name}"></p>
      ${tier.name === 'Starter' ? '<p class="pricing-trial pricing-trial-empty" aria-hidden="true"></p>' : '<p class="pricing-trial">Includes a 7-day free trial</p>'}
      <ul class="pricing-features"></ul>
      <button type="button" class="pricing-subscribe" data-subscribe-to="${tier.name}">Choose ${tier.name}</button>
    `;
    card.querySelector('.pricing-card-description').textContent = tier.description;
    const list = card.querySelector('.pricing-features');
    for (const feature of tier.features) {
      const item = document.createElement('li');
      item.textContent = feature;
      list.append(item);
    }
    card.querySelector('button').addEventListener('click', () => onSubscribe(tier));
    if (free) fragment.append(card);
    else {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = tier.name;
      button.dataset.paidPlan = tier.name;
      button.setAttribute('aria-pressed', String(tier.name === 'Pro'));
      button.addEventListener('click', () => {
        for (const panel of paid.querySelectorAll('.pricing-plan')) panel.hidden = panel.dataset.tier !== tier.name;
        for (const option of toggle.children) option.setAttribute('aria-pressed', String(option === button));
      });
      toggle.append(button); paid.append(card);
    }
  }
  fragment.append(paid);
  root.replaceChildren(fragment);
}

/**
 * Mount Paddle-powered pricing UI. Only a valid two-letter country is sent to
 * Paddle; when headers are absent Paddle localizes the preview itself.
 */
export function createPricingPage({ createCheckout, onFree, section = document.getElementById('pricing') }) {
  const cards = section.querySelector('.pricing-grid');
  const status = section.querySelector('[data-pricing-status], #pricing-status');
  const termButtons = [...section.querySelectorAll('[data-billing-term]')];
  let paddlePromise;
  let previewPromise;
  let activeTerm = 'month';
  let priceTotals = new Map();
  let tiers = PRICING_TIERS;

  async function getPaddle() {
    if (paddlePromise) return paddlePromise;
    const environment = requiredPublicEnv('VITE_PADDLE_ENV');
    tiers = getPricingTiers(environment, import.meta.env.VITE_PADDLE_LIVE_PRICES);
    const token = requiredPublicEnv('VITE_PADDLE_CLIENT_TOKEN');
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new Error('VITE_PADDLE_ENV must be either sandbox or production.');
    }
    if (environment === 'sandbox' && !token.startsWith('test_')) {
      throw new Error('Sandbox pricing requires a Paddle client token beginning with test_.');
    }
    paddlePromise = initializePaddle({ environment, token }).then(instance => {
      if (!instance) throw new Error('Paddle could not initialize. Check the client token.');
      return instance;
    });
    return paddlePromise;
  }

  async function detectCountry() {
    try {
      const response = await fetch('/api/billing-context', { cache: 'no-store' });
      if (!response.ok) return null;
      const { country } = await response.json();
      return /^[A-Z]{2}$/.test(country ?? '') ? country : null;
    } catch {
      return null;
    }
  }

  function updateCards() {
    for (const tier of tiers) {
      if (tier.name === 'Starter') {
        section.querySelector('[data-price-for="Starter"]').textContent = 'Free';
        section.querySelector('[data-period-for="Starter"]').textContent = 'No payment method required';
        continue;
      }
      const total = priceTotals.get(tier.priceId[activeTerm]);
      section.querySelector(`[data-price-for="${tier.name}"]`).textContent = total ?? 'Price unavailable';
      section.querySelector(`[data-period-for="${tier.name}"]`).textContent = total ? `per ${activeTerm === 'month' ? 'month' : 'year'}` : '';
    }
    for (const button of termButtons) {
      const selected = button.dataset.billingTerm === activeTerm;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  async function loadPrices() {
    if (previewPromise) return previewPromise;
    previewPromise = (async () => {
      status.classList.remove('is-error');
      status.textContent = 'Finding prices...';
      const [paddle, country] = await Promise.all([getPaddle(), detectCountry()]);
      const request = {
        items: tiers.filter(tier => tier.name !== 'Starter').flatMap(tier => [
          { priceId: tier.priceId.month, quantity: 1 },
          { priceId: tier.priceId.year, quantity: 1 },
        ]),
      };
      if (country) request.address = { countryCode: country };
      const preview = await paddle.PricePreview(request);
      const lineItems = preview.data?.details?.lineItems;
      if (!Array.isArray(lineItems)) throw new Error('Paddle did not return price line items.');
      priceTotals = new Map(lineItems.map(item => [item.price.id, item.formattedTotals.total]));
      status.textContent = '';
      updateCards();
    })().catch(error => {
      previewPromise = undefined;
      status.classList.add('is-error');
      status.textContent = error instanceof Error ? error.message : 'Unable to load Paddle prices.';
      updateCards();
    });
    return previewPromise;
  }

  async function subscribe(tier) {
    if (tier.name === 'Starter') { onFree?.(); return; }
    const button = section.querySelector(`[data-subscribe-to="${tier.name}"]`);
    button.disabled = true;
    button.textContent = 'Opening checkout...';
    try {
      await loadPrices();
      tier = tiers.find(item => item.name === tier.name);
      if (!priceTotals.has(tier.priceId[activeTerm])) {
        throw new Error('This price is not available for your location right now.');
      }
      const paddle = await getPaddle();
      const checkout = await createCheckout(tier.priceId[activeTerm]);
      paddle.Checkout.open({
        transactionId: checkout.transactionId,
        ...(checkout.email ? { customer: { email: checkout.email } } : {}),
        settings: {
          displayMode: 'overlay',
          variant: 'one-page',
          successUrl: `${window.location.origin}/welcome`,
        },
      });
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = error instanceof Error ? error.message : 'Unable to open checkout.';
    } finally {
      button.disabled = false;
      button.textContent = `Choose ${tier.name}`;
    }
  }

  buildCards(cards, subscribe);
  termButtons.forEach(button => button.addEventListener('click', () => {
    activeTerm = button.dataset.billingTerm;
    updateCards();
  }));
  updateCards();

  return {
    async show() {
      section.hidden = false;
      await loadPrices();
    },
    hide() {
      section.hidden = true;
    },
  };
}
