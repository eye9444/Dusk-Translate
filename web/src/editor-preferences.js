import { LANGUAGES, TRANSLATION_TARGETS, normalizeLanguagePair } from './languages.js';

export function showEditorPreferences({languagePair=normalizeLanguagePair(),saveLanguages=async()=>{},onboarding=false}={}){
  const dialog=document.createElement('dialog');
  dialog.id='editor-preferences-dialog';dialog.setAttribute('aria-labelledby','editor-preferences-title');
  dialog.innerHTML='<form><h2 id="editor-preferences-title">Editor preferences</h2><p>Set your usual language pair and how this browser\'s editor behaves.</p><label><input type="checkbox" name="spellcheck"> Check spelling in translations</label><label><input type="checkbox" name="remember" aria-describedby="provider-storage-warning"> Remember API key and URL on this device</label><p id="provider-storage-warning">Optional, at your own risk. Credentials are stored locally for up to 30 days, not in your account. Anyone with browser access, a malicious extension, or injected site code may read them. Turning this off deletes the saved copy, but keeps credentials in the current editor session.</p><p role="alert"></p><div class="dialog-actions"><button type="button">Cancel</button><button class="primary" type="submit">Save preferences</button></div></form>';
  document.body.append(dialog);
  const form=dialog.querySelector('form'),error=dialog.querySelector('[role="alert"]');
  const label=document.createElement('label');label.className='language-preference';label.textContent='Default translation pair';
  const select=document.createElement('select');select.name='languagePair';
  for(const [source,targets] of Object.entries(TRANSLATION_TARGETS))for(const target of targets){
    const option=document.createElement('option');option.value=`${source}|${target}`;option.textContent=`${LANGUAGES[source].name} → ${LANGUAGES[target].name}`;select.append(option);
  }
  select.value=`${languagePair.sourceLanguage}|${languagePair.targetLanguage}`;label.append(select);
  form.querySelector('p').after(label);
  const help=document.createElement('p');help.className='field-hint';help.textContent='Used for new projects. Existing books keep their own languages. Signed-in choices are saved to your account.';label.after(help);
  if(onboarding){
    form.querySelector('h2').textContent='What do you usually translate?';
    form.querySelector('p').textContent='Choose your usual language pair. New projects will start here, and you can change it later in Account.';
    for(const input of [form.elements.spellcheck,form.elements.remember])input.closest('label').hidden=true;
    form.querySelector('#provider-storage-warning').hidden=true;
    dialog.querySelector('button[type="button"]').textContent='Maybe later';
  }
  try{
    form.elements.spellcheck.checked=localStorage.getItem('dusk-editor-spellcheck')!=='false';
    let saved;try{saved=JSON.parse(localStorage.getItem('dusk-provider-settings'));}catch{}
    form.elements.remember.checked=localStorage.getItem('dusk-remember-provider')==='true'||Boolean(saved&&Number(saved.expiresAt)>Date.now());
  }catch{error.textContent='Browser storage is unavailable. Preferences cannot be saved.';}
  dialog.querySelector('button[type="button"]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove());
  form.onsubmit=async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type="submit"]');submit.disabled=true;error.textContent='';
    try{
      const [sourceLanguage,targetLanguage]=select.value.split('|');
      await saveLanguages(normalizeLanguagePair(sourceLanguage,targetLanguage));
      if(!onboarding){
        localStorage.setItem('dusk-editor-spellcheck',String(form.elements.spellcheck.checked));
        localStorage.setItem('dusk-remember-provider',String(form.elements.remember.checked));
        if(!form.elements.remember.checked)localStorage.removeItem('dusk-provider-settings');
      }
      dialog.close();
    }catch{error.textContent='Could not save preferences. Check your connection and browser storage settings.';}
    finally{submit.disabled=false;}
  };
  dialog.showModal();
  return dialog;
}
