export function createSpendingNotice({ getUser, request }) {
  const accepted = new Set();
  try { if (sessionStorage.getItem('dusk-guest-spending-notice') === 'accepted') accepted.add('guest'); } catch {}
  let pending;
  return async function confirmSpending() {
    const identity = getUser()?.id || 'guest';
    if (accepted.has(identity)) return true;
    if (pending) return pending;
    pending = (async () => {
      if (getUser()) {
        try {
          const preferences = await request('/api/account-preferences');
          if (preferences.dismissApiSpendingNotice) { accepted.add(identity); return true; }
        } catch { /* A failed preference lookup must not skip the warning. */ }
      }
      const dialog = document.createElement('dialog');
      dialog.className = 'spending-notice';
      dialog.innerHTML = `<h2>Set your AI spending budget</h2>
        <p>AI-provider charges are separate from DuskTranslate. You control your provider budget, and our character counter does not cap monetary spending.</p>
        <p>Set provider spending limits where supported and monitor usage. Not every provider offers a hard spending cap. DuskTranslate cannot prevent your provider from charging beyond your intended budget.</p>
        <label><input type="checkbox"> Don't show this again</label>
        <p role="status"></p><footer><button type="button" data-cancel>Cancel</button><button type="button" data-continue>Continue</button></footer>`;
      dialog.querySelector('label').hidden = !getUser();
      document.body.append(dialog);
      return new Promise(resolve => {
        let done = false;
        const finish = value => { if(done)return;done=true;dialog.close();dialog.remove();resolve(value); };
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        dialog.querySelector('[data-cancel]').onclick = () => finish(false);
        dialog.querySelector('[data-continue]').onclick = async () => {
          const button = dialog.querySelector('[data-continue]');button.disabled = true;
          try {
            if ((getUser()?.id || 'guest') !== identity) throw new Error('Account changed. Please retry.');
            if (getUser() && dialog.querySelector('input').checked) {
              await request('/api/account-preferences','PUT',{dismissApiSpendingNotice:true});
            }
            accepted.add(identity);
            if (identity === 'guest') {
              try { sessionStorage.setItem('dusk-guest-spending-notice','accepted'); } catch {}
            }
            finish(true);
          } catch { dialog.querySelector('[role="status"]').textContent='Unable to save the preference. Uncheck it to continue for this session, or retry.'; }
          finally { button.disabled=false; }
        };
        dialog.showModal();
      });
    })();
    try { return await pending; } finally { pending = null; }
  };
}
