export function createFeedbackHub({remote,dialog,isAdmin,onChange=()=>{}}){
  const node=(tag,text='')=>{const element=document.createElement(tag);element.textContent=text;return element;};
  const list=dialog.querySelector('#feedback-inbox-list'),status=dialog.querySelector('#feedback-inbox-status');
  const filter=node('select');filter.setAttribute('aria-label','Filter tickets');
  for(const value of ['all','new','accepted','standby','rejected']){const option=node('option',value==='all'?'All tickets':value);option.value=value;filter.append(option);}
  status.after(filter);let request=0;
  filter.onchange=()=>open();
  async function open(){
    const current=++request;list.replaceChildren();status.textContent='Loading tickets...';
    dialog.querySelector('.eyebrow').textContent=isAdmin()?'FOUNDER INBOX':'YOUR REPORTS';
    dialog.querySelector('h2').textContent='Feedback Hub';
    if(!dialog.open)dialog.showModal();
    try{
      const tickets=await remote.feedbackTickets();if(current!==request||!dialog.open)return;
      status.textContent=`${tickets.length} tickets (most recently updated first)`;
      for(const ticket of tickets.filter(ticket=>filter.value==='all'||ticket.status===filter.value)){
        const card=node('details'),summary=node('summary',`${ticket.unread?'New activity · ':''}${ticket.status} · ${ticket.description.slice(0,90)}`);card.className='feedback-item';
        card.append(summary,node('p',ticket.reporter_email||''),node('p',ticket.description),node('p',new Date(ticket.created_at).toLocaleString()));
        if(ticket.rejection_reason)card.append(node('p',`Reason: ${ticket.rejection_reason}`));
        const error=node('p');error.setAttribute('role','status');card.append(error);
        if(ticket.screenshot_path){const image=node('img');image.className='feedback-preview';image.alt='Report screenshot';image.hidden=true;card.append(image);
          card.addEventListener('toggle',async()=>{if(!card.open||image.src)return;try{image.src=await remote.feedbackScreenshotUrl(ticket.screenshot_path);image.hidden=false;}catch(e){error.textContent=e.message;}});
          image.onerror=()=>{image.removeAttribute('src');image.hidden=true;error.textContent='Screenshot could not load. Reopen this ticket to retry.';};
        }
        const messages=node('div'),form=node('form'),text=node('textarea');text.required=true;text.maxLength=5000;text.rows=4;text.setAttribute('aria-label','Reply to ticket');text.placeholder='Reply to this ticket';
        const submit=node('button','Send reply');submit.type='submit';form.append(text,submit);
        const render=rows=>{
          messages.replaceChildren();
          for(const row of rows){
            const item=node('div'),author=row.from_admin?'Eye':isAdmin()?'Reporter':'You';
            item.className='feedback-item';item.append(node('small',`${author} · ${new Date(row.created_at).toLocaleString()}`),node('p',row.body));messages.append(item);
          }
        };
        card.addEventListener('toggle',async()=>{if(!card.open)return;try{render(await remote.feedbackTicketAction(ticket.id,'read'));summary.textContent=`${ticket.status} · ${ticket.description.slice(0,90)}`;onChange();}catch(e){error.textContent=e.message;}});
        form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{render(await remote.feedbackTicketAction(ticket.id,'reply',text.value));text.value='';onChange();}catch(e){error.textContent=e.message;}finally{submit.disabled=false;}};
        card.append(messages,form);
        if(isAdmin()){
          const controls=node('div');controls.className='dialog-actions';
          for(const state of ['accepted','standby','rejected']){const button=node('button',state);button.type='button';button.onclick=async()=>{
            const reason=state==='rejected'?prompt('Explain why this ticket is being rejected (10 to 5,000 characters):'):'';if(reason===null)return;
            button.disabled=true;try{await remote.feedbackTicketAction(ticket.id,state,reason);await open();onChange();}catch(e){error.textContent=e.message;button.disabled=false;}
          };controls.append(button);}
          const remove=node('button','Delete ticket');remove.type='button';remove.onclick=async()=>{if(!confirm('Delete this ticket and its screenshot?'))return;remove.disabled=true;try{await remote.deleteFeedback(ticket.id,ticket.screenshot_path);await open();onChange();}catch(e){error.textContent=e.message;remove.disabled=false;}};controls.append(remove);card.append(controls);
        }
        list.append(card);
      }
    }catch(e){status.textContent=`Tickets are unavailable: ${e.message}`;}
  }
  dialog.addEventListener('close',()=>{request++;});
  return {open};
}
