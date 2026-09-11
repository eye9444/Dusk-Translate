// Only Supabase credentials use this storage. Project files stay in IndexedDB.
export function createAuthStorage(local, session) {
  const preference='dusk-remember-me';
  const remembered=()=> (session.getItem(preference) ?? local.getItem(preference)) !== 'false';
  let prefix='';
  const target=()=>remembered()?local:session;
  return {
    remembered,
    setPrefix(value){prefix=value;},
    choose(value){
      const old=target(),next=value?local:session;
      if(old!==next&&prefix){
        const keys=Array.from({length:old.length},(_,i)=>old.key(i)).filter(k=>k?.startsWith(prefix));
        for(const key of keys){next.setItem(key,old.getItem(key));old.removeItem(key);}
      }
      session.setItem(preference,String(value));local.setItem(preference,String(value));
    },
    getItem(key){return target().getItem(key);},
    setItem(key,value){target().setItem(key,value);},
    removeItem(key){local.removeItem(key);session.removeItem(key);}
  };
}
