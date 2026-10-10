import test from 'node:test';
import assert from 'node:assert/strict';
import { launchDatabase } from './helpers/launch-db.mjs';

test('public snapshots omit private metadata, excluded translations, and incomplete editions', async () => {
  const db = await launchDatabase();
  const snapshot = {
    novel: { projectType:'web-novel', chapters: [{ id: 'one', title:'One', text: 'Original' }, { id: 'two', title:'Two', text: 'Second' }, { id: 'excluded', title:'Appendix', text: 'Original appendix' }] },
    translations: { one: 'Ready', two: 'Draft…PARTIAL', excluded: 'PRIVATE_DRAFT', stale: 'PRIVATE_ORPHAN' },
    exportExcluded: ['excluded'], glossary: 'PRIVATE_GLOSSARY', customInstructions: 'PRIVATE_PROMPT',
  };
  const publish = async value => (await db.query('select reader_snapshot($1) as result', [value])).rows[0].result;
  try {
    const partial = await publish(snapshot);
    assert.deepEqual(partial.translations, {});
    assert.equal(partial.novel.chapters.length, 3);
    assert.equal(partial.novel.projectType, 'web-novel');
    assert.equal(partial.novel.chapters[0].title, 'One');
    const complete = await publish({ ...snapshot, translations: { ...snapshot.translations, two: 'Finished' } });
    assert.deepEqual(complete.translations, { one: 'Ready', two: 'Finished' });
    assert.doesNotMatch(JSON.stringify(complete), /PRIVATE_/);
    assert.deepEqual((await publish({ ...snapshot, exportExcluded: ['one','two','excluded'] })).translations, {});
    assert.deepEqual((await publish({ ...snapshot, translations: { one: 'Ready', two: '  ' } })).translations, {});
  } finally { await db.close(); }
});
