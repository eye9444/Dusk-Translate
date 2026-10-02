import { initializePaddle } from '@paddle/paddle-js';

import { PRICING_TIERS } from './pricing-tiers.js';

function requiredPublicEnv(name) {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is required. Add it to your environment before opening pricing.`);
  return value;
}

function buildCards(root, onSubscribe) {
  const fragment = document.createDocumentFragment();
  for (const tier of PRICING_TIERS) {
    const card = document.createElement('article');
    card.className = 'pricing-card';
    card.dataset.tier = tier.name;
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
    fragment.append(card);
  }
  root.replaceChildren(fragment);
}

/**
 * Mount Paddle-powered pricing UI. Only a valid two-letter country is sent to
 * Paddle; when headers are absent Paddle localizes the preview itself.
 */
export function createPricingPage({ getUserEmail }) {
  const section = document.getElementById('pricing');
  const cards = document.getElementById('pricing-tiers');
  const status = document.getElementById('pricing-status');
  const location = document.getElementById('pricing-location');
  const termButtons = [...document.querySelectorAll('[data-billing-term]')];
  let paddlePromise;
  let previewPromise;
  let activeTerm = 'month';
  let priceTotals = new Map();

  async function getPaddle() {
    if (paddlePromise) return paddlePromise;
    const environment = requiredPublicEnv('VITE_PADDLE_ENV');
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
    for (const tier of PRICING_TIERS) {
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
        items: PRICING_TIERS.flatMap(tier => [
          { priceId: tier.priceId.month, quantity: 1 },
          { priceId: tier.priceId.year, quantity: 1 },
        ]),
      };
      if (country) request.address = { countryCode: country };
      const preview = await paddle.PricePreview(request);
      const lineItems = preview.data?.details?.lineItems;
      if (!Array.isArray(lineItems)) throw new Error('Paddle did not return price line items.');
      priceTotals = new Map(lineItems.map(item => [item.price.id, item.formattedTotals.total]));
      location.textContent = country ? `Prices localized for ${country}.` : 'Prices localized from your connection.';
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
    const button = section.querySelector(`[data-subscribe-to="${tier.name}"]`);
    button.disabled = true;
    button.textContent = 'Opening checkout...';
    try {
      await loadPrices();
      if (!priceTotals.has(tier.priceId[activeTerm])) {
        throw new Error('This price is not available for your location right now.');
      }
      const paddle = await getPaddle();
      const email = getUserEmail?.();
      paddle.Checkout.open({
        items: [{ priceId: tier.priceId[activeTerm], quantity: 1 }],
        ...(email ? { customer: { email } } : {}),
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
