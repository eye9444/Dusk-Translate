export async function showReaderLinkDialog({project,remote,upgrade}){
 const dialog=document.createElement('dialog');dialog.className='quota-dialog';
 dialog.innerHTML='<h2>Public reader link</h2><p data-status role="status">Checking link access...</p><input data-url readonly aria-label="Public reader URL" hidden><label><input data-comments type="checkbox"> Allow signed-in readers to comment</label><p>Anyone with this link can access the complete original EPUB, including chapters excluded from translated exports. Completed selected translations are also shared. Public comments are separate from private editor threads.</p><footer><button data-enable type="button">Create link</button><button data-copy type="button">Copy link</button><button data-revoke type="button">Revoke link</button><button data-close type="button">Close</button></footer>';
 const get=name=>dialog.querySelector(`[data-${name}]`);
 let state,busy=false,closed=false;
 const buttons=[get('enable'),get('copy'),get('revoke'),get('comments')];
 const setBusy=value=>{busy=value;buttons.forEach(button=>button.disabled=value);};
 async function refresh(){
   setBusy(true);
   try{
     const next=await remote.readerLinkStatus(project.id);if(closed)return;state=next;
     get('status').textContent=state.token?(state.active?'Anyone with this link can read the published book.':'This link is suspended. The publishing account needs Teams and active editor access.'):'No active reader link. Creating a link requires your own Teams plan.';
     get('url').hidden=!state.token;get('url').value=state.token?`${location.origin}/reader?share=${encodeURIComponent(state.token)}`:'';
     get('enable').hidden=Boolean(state.token&&state.active);get('enable').textContent=state.requiresTeams?'Upgrade to Teams':state.token?'Activate with my Teams plan':'Create link';
     get('enable').disabled=!state.requiresTeams&&!state.canCreate;
     get('copy').hidden=!state.token;get('copy').disabled=false;
     get('revoke').hidden=!state.token||!state.canManage;get('revoke').disabled=false;
     get('comments').checked=state.commentsEnabled;
     get('comments').disabled=!state.token||!state.canManage||(!state.commentsEnabled&&!state.canEnableComments);
   }catch(error){get('status').textContent=error.message;}finally{busy=false;}
 }
 async function change(action){if(busy)return;setBusy(true);try{await action();await refresh();}catch(error){await refresh();get('status').textContent=error.message;}finally{busy=false;}}
 get('close').onclick=()=>dialog.close();
 get('enable').onclick=()=>state?.requiresTeams?upgrade():change(()=>remote.enablePublicReaderLink(project.id));
 get('revoke').onclick=()=>change(()=>remote.disablePublicReaderLink(project.id));
 get('comments').onchange=()=>change(()=>remote.setReaderCommenting(project.id,get('comments').checked));
 get('copy').onclick=async()=>{try{await navigator.clipboard.writeText(get('url').value);get('status').textContent='Link copied.';}catch{get('url').select();get('status').textContent='Select and copy the link above.';}};
 dialog.addEventListener('close',()=>{closed=true;dialog.remove();});
 document.body.append(dialog);dialog.showModal();await refresh();
}
