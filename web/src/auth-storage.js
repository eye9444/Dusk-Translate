// Only Supabase credentials use this storage. Project files stay in IndexedDB.
// The adapter lets users choose persistent or tab-scoped authentication without
// changing how the rest of the application reads the Supabase session.
export function createAuthStorage(local, session) {
  const preference='dusk-remember-me';
  // The preference itself must survive a browser restart. Keeping a second copy
  // in sessionStorage allowed stale tab state to override a persistent login.
  const remembered=()=>local.getItem(preference) !== 'false';
  let prefix='';
  const target=()=>remembered()?local:session;
  const moveCredentials=(from,to)=>{
    if(from===to||!prefix)return;
    const keys=Array.from({length:from.length},(_,i)=>from.key(i)).filter(key=>key?.startsWith(prefix));
    for(const key of keys){
      const value=from.getItem(key);
      if(value!==null)to.setItem(key,value);
      from.removeItem(key);
    }
  };
  return {
    remembered,
    setPrefix(value){prefix=value;},
    choose(value){
      const old=target();
      local.setItem(preference,String(value));
      session.removeItem(preference);
      moveCredentials(old,target());
    },
    getItem(key){return target().getItem(key);},
    setItem(key,value){target().setItem(key,value);},
    removeItem(key){local.removeItem(key);session.removeItem(key);}
  };
}
