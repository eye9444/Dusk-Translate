export function showEditorPreferences(){
  const dialog=document.createElement('dialog');
  dialog.id='editor-preferences-dialog';dialog.setAttribute('aria-labelledby','editor-preferences-title');
  dialog.innerHTML='<form><h2 id="editor-preferences-title">Editor preferences</h2><p>Saved on this browser and shared with the editor controls. Applies to books opened here, not to other collaborators.</p><label><input type="checkbox" name="spellcheck"> Check spelling in translations</label><label><input type="checkbox" name="linked"> Link source and translation scrolling</label><p role="alert"></p><div class="dialog-actions"><button type="button">Cancel</button><button class="primary" type="submit">Save preferences</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),error=dialog.querySelector('[role="alert"]');
  try{form.elements.spellcheck.checked=localStorage.getItem('dusk-editor-spellcheck')!=='false';form.elements.linked.checked=localStorage.getItem('dusk-linked-scrolling')==='true';}catch{error.textContent='Browser storage is unavailable. Preferences cannot be saved.';}
  dialog.querySelector('button[type="button"]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  form.onsubmit=event=>{
    event.preventDefault();
    try{
      localStorage.setItem('dusk-editor-spellcheck',String(form.elements.spellcheck.checked));
      localStorage.setItem('dusk-linked-scrolling',String(form.elements.linked.checked));
      dialog.close();
    }catch{error.textContent='Could not save preferences. Check your browser storage settings.';}
  };
  dialog.showModal();
}
