// Presence is ephemeral and independent of revision-checked document saves.
export function startProjectPresence(client, projectId, selfId, publish) {
  const tabId = crypto.randomUUID();
  let stopped = false, timer, location = {};
  function update(value) {
    location = {
      chapter: String(value?.chapter || '').slice(0,160),
      pane: value?.pane === 'source' ? 'source' : 'translation',
      offset: Number.isSafeInteger(value?.offset) && value.offset >= 0 ? value.offset : null,
      fingerprint: String(value?.fingerprint || '').slice(0,100),
      active: value?.active === true,
      visible: value?.visible === true,
    };
  }
  const leave = () => { void client.rpc('leave_project_presence', { target_project_id: projectId, tab_id: tabId }).then(()=>{},()=>{}); };
  async function poll() {
    try {
      const { data, error } = await client.rpc('sync_project_presence', {
        target_project_id: projectId, tab_id: tabId, cursor_state: location,
      }).abortSignal(AbortSignal.timeout(8000));
      if (stopped) return;
      if (error) throw error;
      publish({ selfId, members: data || [], unavailable: false });
    } catch {
      if (!stopped) publish({ selfId, members: [], unavailable: true });
    } finally {
      if (!stopped) timer = setTimeout(poll, 2000);
      else leave();
    }
  }
  void poll();
  return {
    update,
    stop() { stopped = true; clearTimeout(timer); leave(); },
  };
}
