import { locateCommentAnchor } from './comment-anchors.js';
import './comments.css';

const node = (tag, text, className = '') => { const element = document.createElement(tag); element.textContent = text; element.className = className; return element; };
const control = (label, action) => { const element = node('button', label); element.type = 'button'; element.onclick = action; return element; };

export function createComments({ cloud, local, getProject, getUser, focus, clearFocus = () => {} }) {
  const panel = node('aside', '', 'comments-panel'); panel.hidden = true;
  panel.setAttribute('aria-label', 'Project comments');
  const header = node('div', '', 'comments-header');
  header.append(node('h2', 'Comments'), control('Close comments', close));
  const status = node('p', '', 'comments-status'); status.setAttribute('role', 'status');
  const quote = node('blockquote', 'Select text in either pane to start a thread.');
  const form = document.createElement('form'), input = document.createElement('textarea');
  input.maxLength = 4000; input.required = true; input.placeholder = 'Leave a comment'; input.setAttribute('aria-label', 'New comment');
  const submit = node('button', 'Post comment'); submit.type = 'submit';
  form.append(quote, input, submit);
  const resolvedLabel = node('label', '', 'comments-filter'), resolved = document.createElement('input'); resolved.type = 'checkbox';
  resolvedLabel.append(resolved, document.createTextNode(' Show resolved'));
  const list = node('div', '', 'comments-list');
  panel.append(header, status, form, resolvedLabel, list); document.body.append(panel);
  let project = null, anchor = null, threads = [], timer = null, request = 0, writing = false, loaded = false, fingerprint = '';
  const me = () => getUser()?.id || 'guest';
  const editable = () => project && project.accessRole !== 'viewer';
  const textFor = item => {
    const snapshot = getProject()?.snapshot;
    return item.pane === 'source' ? snapshot?.novel?.chapters.find(ch => ch.id === item.chapterId)?.text : snapshot?.translations?.[item.chapterId]?.replace(/…PARTIAL$/, '');
  };
  async function rpc(name, args) {
    const result = await cloud.rpc(name, args);
    if (result.error) throw new Error(result.error.code === 'PGRST202' ? 'Comments are not available on the server yet. Your text has not been posted.' : result.error.message);
    return result.data;
  }
  async function refresh() {
    if (!project || panel.hidden || writing) return;
    const current = project, version = ++request;
    try {
      const value = current.owner === 'guest' ? await local.comments('guest', current.id) : await rpc('list_project_comments', { target_project_id: current.id });
      if (version !== request || project !== current || panel.hidden) return;
      if (!Array.isArray(value)) throw new Error('Could not read project comments.');
      threads = value; loaded = true; status.textContent = '';
      submit.disabled = !anchor || !editable();
      const next = JSON.stringify(value);
      // Avoid replacing focused reply fields on every polling tick.
      if (next !== fingerprint && !list.contains(document.activeElement)) { render(); fingerprint = next; }
    } catch (error) {
      if (project !== current || panel.hidden) return;
      loaded = false; fingerprint = ''; submit.disabled = true; status.textContent = error.message;
      list.replaceChildren(control('Retry loading comments', refresh));
    }
  }
  function render() {
    list.replaceChildren();
    const visible = threads.filter(thread => resolved.checked || !thread.resolved);
    if (!visible.length) list.append(node('p', 'No comments yet.'));
    for (const thread of visible) {
      const card = node('article', '', 'comment-thread');
      const location = locateCommentAnchor(thread.anchor, textFor(thread.anchor));
      const jump = control(`${thread.anchor.chapterId}: ${thread.anchor.quote}`, () => {
        const latest = locateCommentAnchor(thread.anchor, textFor(thread.anchor));
        if (latest) focus({ ...thread.anchor, ...latest });
        else status.textContent = 'This passage has changed. The original quote is preserved here.';
      });
      jump.className = 'comment-quote'; card.append(jump);
      if (!location) card.append(node('p', 'Passage changed or unavailable', 'comments-status'));
      if (thread.resolved) card.append(node('p', 'Resolved', 'comments-status'));
      for (const message of thread.messages) {
        const entry = node('div', '', 'comment-message');
        entry.append(node('small', `${message.author_id === me() ? 'You' : message.author_name || 'Collaborator'} · ${new Date(message.created_at).toLocaleString()}${message.edited_at ? ' · edited' : ''}`), node('p', message.body));
        if (message.author_id === me()) entry.append(control('Edit comment', () => {
          const edit = document.createElement('textarea'); edit.value = message.body; edit.maxLength = 4000; edit.setAttribute('aria-label', 'Edit comment text');
          entry.replaceChildren(edit, control('Save comment', () => write('edit', message.id, edit.value)), control('Cancel edit', render)); edit.focus();
        }));
        if (message.author_id === me() || project.accessRole === 'owner') entry.append(control('Delete comment', () => write('delete', message.id)));
        card.append(entry);
      }
      const reply = document.createElement('textarea'); reply.maxLength = 4000; reply.placeholder = 'Reply'; reply.setAttribute('aria-label', 'Reply to thread');
      card.append(reply, control('Post reply', () => write('reply', thread.id, reply.value)), control(thread.resolved ? 'Reopen thread' : 'Resolve thread', () => write(thread.resolved ? 'reopen' : 'resolve', thread.id)));
      if (thread.author_id === me() || project.accessRole === 'owner') card.append(control('Delete thread', () => write('delete-thread', thread.id)));
      list.append(card);
    }
  }
  async function write(action, targetId = null, body = null) {
    if (writing || !editable() || !loaded) return;
    if (['create', 'reply', 'edit'].includes(action) && (!body?.trim() || body.length > 4000)) { status.textContent = 'Enter a comment of 1 to 4,000 characters.'; return; }
    writing = true; submit.disabled = true; status.textContent = 'Saving comment…';
    const current = project;
    try {
      if (current.owner !== 'guest') await rpc('write_project_comment', { target_project_id: current.id, action, target_id: targetId, comment_body: body, comment_anchor: action === 'create' ? anchor : null });
      else {
        const next = structuredClone(threads), time = new Date().toISOString();
        const message = () => ({ id: crypto.randomUUID(), author_id: 'guest', author_name: 'You', body: body.trim(), created_at: time });
        if (action === 'create') {
          if (!anchor) throw new Error('Select text before posting.');
          next.push({ id: crypto.randomUUID(), author_id: 'guest', anchor, resolved: false, created_at: time, messages: [message()] });
        } else if (['reply', 'resolve', 'reopen', 'delete-thread'].includes(action)) {
          const index = next.findIndex(thread => thread.id === targetId), thread = next[index];
          if (!thread) throw new Error('Thread no longer exists.');
          if (action === 'reply') thread.messages.push(message());
          else if (action === 'delete-thread') next.splice(index, 1);
          else thread.resolved = action === 'resolve';
        } else {
          const thread = next.find(thread => thread.messages.some(message => message.id === targetId));
          if (!thread) throw new Error('Comment no longer exists.');
          if (action === 'delete') thread.messages = thread.messages.filter(message => message.id !== targetId);
          else Object.assign(thread.messages.find(message => message.id === targetId), { body: body.trim(), edited_at: time });
        }
        if (next.length > 1000 || next.reduce((sum, thread) => sum + thread.messages.length, 0) > 5000) throw new Error('Project comment limit reached.');
        await local.saveComments('guest', current.id, next);
      }
      if (current !== project) return;
      if (action === 'create') input.value = '';
      fingerprint = ''; writing = false;
      document.activeElement?.blur(); await refresh();
    } catch (error) { if (current === project) status.textContent = error.message; }
    finally { writing = false; submit.disabled = !loaded || !anchor || !editable(); }
  }
  function close() { clearFocus(); panel.hidden = true; clearInterval(timer); timer = null; request++; project = null; document.body.classList.remove('comments-open'); }
  resolved.onchange = render;
  form.onsubmit = event => { event.preventDefault(); write('create', null, input.value); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  return {
    async open(selection) {
      const next = getProject();
      if (!next || next.accessRole === 'viewer') return;
      if (project?.id !== next.id) { threads = []; input.value = ''; fingerprint = ''; loaded = false; }
      project = next; anchor = selection || null; panel.hidden = false; document.body.classList.add('comments-open');
      quote.textContent = anchor?.quote || 'Select text in either pane to start a thread.';
      input.disabled = !anchor; submit.disabled = true; status.textContent = 'Loading comments…';
      await refresh(); clearInterval(timer); if (!panel.hidden) timer = setInterval(refresh, 5000);
    },
    close,
  };
}
