const loader = document.getElementById('app-loading');
const label = loader?.querySelector('[data-loading-label]');
let pending = 0;
let showTimer = 0;

export function setLoading(isLoading, message = 'Loading') {
  if (!loader) return;
  if (isLoading) {
    pending += 1;
    if (message && label) label.textContent = message;
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => { if (pending) loader.hidden = false; }, 140);
    return;
  }
  pending = Math.max(0, pending - 1);
  if (!pending) { clearTimeout(showTimer); loader.hidden = true; }
}

export async function withLoading(task, message) {
  setLoading(true, message);
  try { return await task(); } finally { setLoading(false); }
}
