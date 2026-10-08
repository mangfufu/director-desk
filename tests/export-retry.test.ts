import test from 'node:test';
import assert from 'node:assert/strict';
import { ExportRetry } from '../src/exporting/retry.ts';
import { planVideoExports } from '../src/exporting/plan.ts';
test('batch retries skip completed files but invalidate on scene/destination or settings changes', () => {
    const jobs = planVideoExports(['a','b','c'].map(id => ({id,name:id,duration:1,fps:24,aspect:'16:9'})), ['a','b','c'].map(sceneId => ({sceneId,filename:sceneId})), {size:640,fps:'scene',format:'mp4',monochrome:false});
    const r = new ExportRetry(); r.prepare('revision-1-dir-a'); r.complete(jobs[0]);
    r.prepare('revision-1-dir-a'); assert.deepEqual(r.remaining(jobs).map(j => j.sceneId), ['b','c']);
    const changed = structuredClone(jobs); changed[0].options.width = 1280;
    assert.equal(r.remaining(changed).length, 3);
    r.prepare('revision-2-dir-a'); assert.equal(r.remaining(jobs).length, 3);
    r.complete(jobs[0]); r.prepare('revision-2-dir-b'); assert.equal(r.remaining(jobs).length, 3);
});
