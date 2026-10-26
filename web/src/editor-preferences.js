export function showEditorPreferences(){
  const dialog=document.createElement('dialog');
  dialog.id='editor-preferences-dialog';dialog.setAttribute('aria-labelledby','editor-preferences-title');
  dialog.innerHTML='<form><h2 id="editor-preferences-title">Editor preferences</h2><p>Saved on this browser and shared with the editor controls. Applies to books opened here, not to other collaborators.</p><label><input type="checkbox" name="spellcheck"> Check spelling in translations</label><label><input type="checkbox" name="remember" aria-describedby="provider-storage-warning"> Remember API key and URL on this device</label><p id="provider-storage-warning">Optional, at your own risk. Credentials are stored locally for up to 30 days, not in your account. Anyone with browser access, a malicious extension, or injected site code may read them. Turning this off deletes the saved copy, but keeps credentials in the current editor session.</p><p role="alert"></p><div class="dialog-actions"><button type="button">Cancel</button><button class="primary" type="submit">Save preferences</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),error=dialog.querySelector('[role="alert"]');
  try{
    form.elements.spellcheck.checked=localStorage.getItem('dusk-editor-spellcheck')!=='false';
    let saved;try{saved=JSON.parse(localStorage.getItem('dusk-provider-settings'));}catch{}
    form.elements.remember.checked=localStorage.getItem('dusk-remember-provider')==='true'||Boolean(saved&&Number(saved.expiresAt)>Date.now());
  }catch{error.textContent='Browser storage is unavailable. Preferences cannot be saved.';}
  dialog.querySelector('button[type="button"]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  form.onsubmit=event=>{
    event.preventDefault();
    try{
      localStorage.setItem('dusk-editor-spellcheck',String(form.elements.spellcheck.checked));
      localStorage.setItem('dusk-remember-provider',String(form.elements.remember.checked));
      if(!form.elements.remember.checked)localStorage.removeItem('dusk-provider-settings');
      dialog.close();
    }catch{error.textContent='Could not save preferences. Check your browser storage settings.';}
  };
  dialog.showModal();
}
