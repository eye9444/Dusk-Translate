export function createReaderComments({root,content,remote,getUser,signIn,onInvalid}){
 let token=null,chapterId=null,version=null,quote='',generation=0,timer;
 root.innerHTML='<h2>Reader comments</h2><p data-status role="status"></p><p data-selection></p><form><label>Comment<textarea maxlength="2000" required rows="3"></textarea></label><button type="submit">Post comment</button></form><div data-comments></div>';
 const status=root.querySelector('[data-status]'),form=root.querySelector('form'),input=root.querySelector('textarea'),list=root.querySelector('[data-comments]');
 const node=(tag,text)=>{const item=document.createElement(tag);item.textContent=text;return item;};
 content.addEventListener('mouseup',()=>{
   const selection=getSelection();
   quote=selection?.rangeCount&&content.contains(selection.anchorNode)&&content.contains(selection.focusNode)?selection.toString().slice(0,1000):'';
   root.querySelector('[data-selection]').textContent=quote?'Selected passage: '+quote:'Comments without a selection refer to this chapter.';
 });
 async function write(operation,values){
   if(!getUser()){signIn();return;}
   try{await remote.writeReaderComment(token,chapterId,operation,values);await refresh();}
   catch(error){status.textContent=error.message;throw error;}
 }
 async function refresh(){
   if(!token)return;
   const stamp=++generation;
   try{
     const data=await remote.readerComments(token,chapterId);
     if(stamp!==generation)return;
     form.hidden=false;
     version=data.version;status.textContent=data.enabled?'Select a passage to anchor your comment, or comment on the chapter.':'The owner has disabled new comments.';
     input.disabled=!data.enabled||!version;form.querySelector('button').disabled=!data.enabled||!version;
     list.replaceChildren();
     for(const comment of data.comments){
       const article=node('article','');article.className='reader-comment';
       article.append(node('strong',comment.author),node('p',comment.body));
       if(comment.quote)article.append(node('blockquote',comment.quote));
       if(comment.outdated)article.append(node('small','Refers to an earlier text version.'));
       if(comment.mine&&data.enabled){
         const edit=node('button','Edit');edit.type='button';article.append(edit);
         edit.onclick=()=>{
           edit.disabled=true;
           const field=node('textarea','');field.value=comment.body;field.maxLength=2000;field.setAttribute('aria-label','Edit your reader comment');
           const save=node('button','Save'),cancel=node('button','Cancel');
           save.type=cancel.type='button';article.append(field,save,cancel);
           cancel.onclick=()=>{field.remove();save.remove();cancel.remove();edit.disabled=false;};
           save.onclick=()=>write('edit',{id:comment.id,body:field.value}).catch(()=>{});
         };
       }
       if(comment.canDelete){const remove=node('button','Delete');remove.type='button';remove.onclick=()=>write('delete',{id:comment.id}).catch(()=>{});article.append(remove);}
       list.append(article);
     }
   }catch(error){if(stamp!==generation)return;status.textContent=error.message;form.hidden=true;list.replaceChildren();onInvalid(error);}
 }
 form.onsubmit=async event=>{
   event.preventDefault();if(!getUser()){signIn();return;}
   const button=form.querySelector('button');button.disabled=true;
   try{await write('create',{body:input.value,quote,version});input.value='';}
   catch{}finally{button.disabled=false;}
 };
 return {
   async open(nextToken,nextChapter){clearInterval(timer);token=nextToken;chapterId=nextChapter;quote='';input.value='';root.querySelector('[data-selection]').textContent='Comments without a selection refer to this chapter.';root.hidden=!token;form.hidden=false;if(!token)return;const openedToken=token,openedChapter=chapterId;await refresh();if(token===openedToken&&chapterId===openedChapter)timer=setInterval(refresh,30000);},
   close(){generation++;clearInterval(timer);token=null;root.hidden=true;list.replaceChildren();},
 };
}
