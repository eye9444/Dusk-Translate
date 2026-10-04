import * as Y from 'yjs';
import { openSharedDocument } from '../web/src/shared-document.js';

export function validateDocumentUpdate(seed, updates, candidate, tier) {
  const doc=openSharedDocument(seed);
  try {
    for(const update of updates)Y.applyUpdate(doc,update);
    const before=JSON.stringify([...doc.getMap('ruby').entries()].sort(([a],[b])=>a.localeCompare(b)));
    Y.applyUpdate(doc,candidate);
    if(doc.store.pendingStructs || doc.store.pendingDs)throw new Error('Update dependencies are missing. Sync and retry.');
    const after=JSON.stringify([...doc.getMap('ruby').entries()].sort(([a],[b])=>a.localeCompare(b)));
    if(tier==='free' && before!==after)throw new Error('Creating or editing ruby requires Pro.');
    if(doc.getMap('metadata').get('version')!==1)throw new Error('Document version cannot be changed.');
  } finally {doc.destroy();}
}
