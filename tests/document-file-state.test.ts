import test from 'node:test';
import assert from 'node:assert/strict';
import { demoProject } from '../src/model.ts';
import { SceneSession } from '../src/scenes/sequence-session.ts';
import { duplicateDocumentScene, readSceneDocument } from '../src/scenes/sequence-project.ts';

test('saved content stays clean across navigation and returns clean on undo', () => {
    const s = new SceneSession(demoProject()); s.markSaved('first.director');
    assert.equal(s.dirty, false);
    const t = s.begin(); t.project.entities[0].position[0] += 2; s.commit(t);
    assert.equal(s.dirty, true); s.undo(); assert.equal(s.dirty, false);
    s.redo(); assert.equal(s.dirty, true); s.markSaved(); assert.equal(s.dirty, false);
    s.undo(); assert.equal(s.dirty, true); s.redo(); assert.equal(s.dirty, false);
    s.editDocument(s.context, '复制', d => duplicateDocumentScene(d, d.activeSceneId, '第二场', 'second'));
    s.markSaved(); s.switchScene('scene-main'); assert.equal(s.dirty, false);
    assert.equal(s.filePath, 'first.director');
});

test('opening/newing and undo restore the correct file identity and latest save point', () => {
    const s = new SceneSession(demoProject()); s.markSaved('first.director');
    const next = readSceneDocument(demoProject()); next.name = 'Second';
    s.replace(next, s.context, '打开工程'); s.setFile('second.director', true);
    const t = s.begin(); t.project.name = 'Second edited'; s.commit(t); s.markSaved();
    s.undo(); assert.equal(s.filePath, 'second.director'); assert.equal(s.dirty, true);
    s.undo(); assert.equal(s.filePath, 'first.director'); assert.equal(s.dirty, false);
    s.redo(); assert.equal(s.filePath, 'second.director'); assert.equal(s.dirty, true);
    s.redo(); assert.equal(s.dirty, false);
    const newDoc = readSceneDocument(demoProject()); newDoc.name = 'New';
    s.replace(newDoc, s.context, '新建工程'); s.setFile();
    assert.equal(s.filePath, ''); assert.equal(s.dirty, true);
    s.undo(); assert.equal(s.filePath, 'second.director'); assert.equal(s.dirty, false);
    assert.equal(JSON.stringify(s.exportDocument()).includes('second.director'), false);
    s.replace(s.exportDocument(), s.context, '打开相同内容的另一个文件', true); s.setFile('same-content.director', true);
    s.undo(); assert.equal(s.filePath, 'second.director'); assert.equal(s.dirty, false);
});
