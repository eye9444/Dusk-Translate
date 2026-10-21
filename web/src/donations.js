import './donations.css';

const NOTICE_KEY = 'dusk-support-notice-v1';

export function createDonations() {
  const dialog = document.createElement('dialog');
  dialog.className = 'support-dialog';
  dialog.setAttribute('aria-labelledby', 'support-title');
  dialog.innerHTML = `<h2 id="support-title">Help keep DuskTranslate afloat</h2>
    <p>Enjoying the novel translation suite? Optional donations help cover hosting and development. All current features are free to use.</p>
    <p class="field-hint">Donations are coming soon while payment setup is being verified. There is no payment link or QR code yet.</p>
    <p class="field-hint">You can also help by sharing DuskTranslate or sending feedback. AI-provider charges still apply when you use your own API key.</p>
    <button type="button" data-close>Close</button>`;
  const notice = document.createElement('aside');
  notice.className = 'support-notice';
  notice.hidden = true;
  notice.setAttribute('aria-label', 'Support DuskTranslate');
  notice.innerHTML = `<button type="button" class="support-dismiss" aria-label="Dismiss donation reminder">×</button>
    <button type="button" class="support-message">Enjoying DuskTranslate? Help keep it afloat with an optional donation.</button>
    <button type="button" class="primary" data-sure>Sure</button>`;
  document.body.append(dialog, notice);
  let timer, shown = false;
  try { shown = sessionStorage.getItem(NOTICE_KEY) === 'seen'; } catch {}
  const dismiss = () => { clearTimeout(timer); notice.hidden = true; };
  const open = () => { dismiss(); if (!dialog.open) dialog.showModal(); };
  notice.querySelector('.support-dismiss').onclick = dismiss;
  notice.querySelector('.support-message').onclick = open;
  notice.querySelector('[data-sure]').onclick = open;
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  return {
    open,
    update(homeVisible) {
      if (!homeVisible) { dismiss(); return; }
      if (shown || document.querySelector('dialog[open]')) return;
      shown = true;
      try { sessionStorage.setItem(NOTICE_KEY, 'seen'); } catch {}
      notice.hidden = false;
      timer = setTimeout(dismiss, 10000);
    },
  };
}
