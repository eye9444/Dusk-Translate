globalThis.DuskLinkedScroll = function (source, translation, initiallyEnabled = false) {
  let enabled = initiallyEnabled;
  const expected = new WeakMap();
  const cleanups = [];
  function synchronize(from, to) {
    if (!enabled) return;
    const ownRange = Math.max(0, from.scrollHeight - from.clientHeight);
    const otherRange = Math.max(0, to.scrollHeight - to.clientHeight);
    if (!ownRange || !otherRange) return;
    const next = Math.max(0, Math.min(1, from.scrollTop / ownRange)) * otherRange;
    if (Math.abs(to.scrollTop - next) < 1) return;
    expected.set(to, next);
    to.scrollTop = next;
  }
  for (const [from, to] of [[source, translation], [translation, source]]) {
    const scroll = () => {
      const requested = expected.get(from);
      expected.delete(from);
      // Programmatic scroll events arrive asynchronously; do not bounce them back.
      if (requested !== undefined && Math.abs(from.scrollTop - requested) < 1) return;
      synchronize(from, to);
    };
    const intent = () => expected.delete(from);
    from.addEventListener('scroll', scroll, { passive: true });
    for (const event of ['wheel', 'pointerdown', 'keydown', 'touchstart']) from.addEventListener(event, intent, { passive: true });
    cleanups.push(() => {
      from.removeEventListener('scroll', scroll);
      for (const event of ['wheel', 'pointerdown', 'keydown', 'touchstart']) from.removeEventListener(event, intent);
    });
  }
  return {
    setEnabled(value) {
      enabled = Boolean(value);
      expected.delete(source); expected.delete(translation);
      if (enabled) synchronize(source, translation);
    },
    reset() {
      if (!enabled) return;
      for (const pane of [source, translation]) { expected.set(pane, 0); pane.scrollTop = 0; }
    },
    destroy() { cleanups.forEach(cleanup => cleanup()); },
  };
};
