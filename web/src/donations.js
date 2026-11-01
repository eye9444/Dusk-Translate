import './donations.css';

const NOTICE_KEY = 'dusk-support-notice-v1';

export function createDonations() {
  const dialog = document.createElement('dialog');
  dialog.className = 'support-dialog';
  dialog.setAttribute('aria-labelledby', 'support-title');
  dialog.innerHTML = `<h2 id="support-title">Help keep DuskTranslate afloat</h2>
    <p>Enjoying the novel translation suite? Optional donations help cover hosting and development. All current features are free to use.</p>
    <p class="field-hint">Any amount helps keep the site running. Thank you.</p>
    <p>No payment needed to help out: contribute code or ideas on GitHub, star the repository, or watch it to follow the project.</p>
    <p>I'm currently working on optimising the site and cleaning up the codebase. Apparently the code needs housekeeping too.</p>
    <nav class="support-links" aria-label="Ways to support DuskTranslate">
      <a href="https://paypal.me/eye9444" target="_blank" rel="noopener noreferrer" aria-label="Donate via PayPal" title="Donate via PayPal">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z"/></svg>
      </a>
      <a href="https://github.com/eye9444/Dusk-Translate" target="_blank" rel="noopener noreferrer" aria-label="Support on GitHub" title="Support on GitHub">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.1c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.3 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.1c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .7Z"/></svg>
      </a>
    </nav>
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
