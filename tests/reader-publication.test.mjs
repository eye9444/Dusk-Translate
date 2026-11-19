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
    const projectId = '00000000-0000-0000-0000-000000000001';
    const ownerId = '00000000-0000-0000-0000-000000000002';
    await db.query("insert into auth.users(id,email) values($1,'reader-owner@test.invalid')", [ownerId]);
    await db.query("insert into projects(id,owner_id,title,file_name,file_path) values($1,$2,'Book','book.epub',$3)", [projectId, ownerId, `${ownerId}/${projectId}/original`]);
    await db.query('insert into project_workflows(project_id,lead_id,enabled) values($1,$2,true)', [projectId, ownerId]);
    const teamEdition = async value => (await db.query(
      'select public.workflow_reader_snapshot($1, $2) as result',
      [projectId, value],
    )).rows[0].result;
    assert.deepEqual(await teamEdition({...snapshot, translations: {...snapshot.translations, two:'Finished'}}), complete);
    assert.deepEqual((await teamEdition(snapshot)).translations, {});
    assert.doesNotMatch(JSON.stringify(complete), /PRIVATE_/);
    assert.deepEqual((await publish({ ...snapshot, exportExcluded: ['one','two','excluded'] })).translations, {});
    assert.deepEqual((await publish({ ...snapshot, translations: { one: 'Ready', two: '  ' } })).translations, {});
  } finally { await db.close(); }
});
