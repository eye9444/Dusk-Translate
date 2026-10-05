// Priorities preserve records: unchecked entries are never deleted.
export function showCapacitySelection({title,description,entries,allowance,save}) {
 const dialog=document.createElement('dialog');dialog.className='capacity-dialog';
 const heading=document.createElement('h2');heading.textContent=title;
 const details=document.createElement('p');details.textContent=description;
 const hint=document.createElement('p');hint.className='capacity-hint';hint.textContent='Checked projects get priority when your account reaches its limit. Unchecked projects are kept and remain available for reading and export.';
 const form=document.createElement('form'),list=document.createElement('div'),status=document.createElement('p');
 status.setAttribute('role','status');
 const checks=entries.map(entry=>{
   const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
   input.type='checkbox';input.value=entry.id;input.checked=entry.selected;
   name.textContent=entry.title+(entry.archived?' (archived)':'');label.append(input,name);list.append(label);return input;
 });
 const footer=document.createElement('footer'),cancel=document.createElement('button'),submit=document.createElement('button');
 cancel.type='button';cancel.textContent='Cancel';submit.type='submit';submit.textContent='Save selection';
 cancel.onclick=()=>dialog.close();footer.append(cancel,submit);form.append(hint,list,status,footer);dialog.append(heading,details,form);
 const update=()=>{const count=checks.filter(input=>input.checked).length;status.textContent=entries.length<=allowance?`All ${entries.length} projects fit within your ${allowance} editable slots.`:`${count} prioritized / ${allowance} editable slots. Older unselected projects fill remaining slots.`;submit.disabled=count>allowance;};
 checks.forEach(input=>input.onchange=update);update();
 form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{await save(checks.filter(input=>input.checked).map(input=>input.value));dialog.close();}catch(error){status.textContent=error.message;submit.disabled=false;}};
 dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
