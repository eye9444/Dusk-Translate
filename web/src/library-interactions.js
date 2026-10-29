// Touch uses two nearby taps so browsing a cover never opens a book accidentally.
export function bindProjectSurface(surface, open, { gallery = false } = {}) {
  let lastTap = null, pointer = null;
  const controls = 'button,a,input,select,textarea,summary,progress,[contenteditable]';
  surface.tabIndex = 0;
  surface.onpointerdown = event => {
    surface.classList.toggle('is-touch', event.pointerType === 'touch');
    pointer = { type: event.pointerType, x: event.clientX, y: event.clientY };
  };
  surface.onpointerenter = event => { if (event.pointerType === 'mouse') surface.classList.remove('is-touch'); };
  surface.onpointercancel = () => { lastTap = null; pointer = null; };
  surface.onclick = event => {
    if (event.target.closest(controls)) { lastTap = null; return; }
    if (window.getSelection()?.toString()) return;
    const touch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents ||
      (event.detail > 0 && pointer?.type === 'touch');
    if (!touch) { open(); return; }
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) return;
    const now = performance.now();
    if (lastTap && now - lastTap.time < 450 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 40) {
      lastTap = null;
      open();
      return;
    }
    lastTap = { time: now, x: event.clientX, y: event.clientY };
    if (gallery) {
      const expanded = surface.classList.toggle('is-expanded');
      surface.setAttribute('aria-expanded', String(expanded));
    }
  };
  surface.onkeydown = event => {
    if (event.target === surface && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      open();
    }
    if (event.key === 'Escape' && gallery) {
      surface.classList.remove('is-expanded');
      surface.setAttribute('aria-expanded', 'false');
    }
  };
}
