import test from 'node:test';
import assert from 'node:assert/strict';
import {demoProject} from '../src/model.ts';
import {contactShots,contactNotes,contactCardHtml,contactHtmlStart} from '../src/production/contact-sheet.ts';

test('contact samples remain within each cut including subframe cuts and final output frame',()=>{
    const p=demoProject(),id=p.cuts[0].cameraId;p.duration=3.01;p.cuts=[{time:0,cameraId:id},{time:1.001,cameraId:id},{time:1.002,cameraId:id},{time:3,cameraId:id}];
    const shots=contactShots(p);assert.equal(shots.length,4);
    for(const shot of shots)assert.ok(shot.time>=shot.start&&shot.time<shot.end);
    assert.equal(shots.at(-1)!.end,3.01);
    p.production={fixedPrompt:'',sceneReferenceIds:[],notes:[{id:'n',actorId:'',start:1.002,end:3,story:'middle',emotion:'',dialogue:'',action:''}]};
    assert.equal(contactNotes(p,shots[1]),'');assert.equal(contactNotes(p,shots[2]),'middle');assert.equal(contactNotes(p,shots[3]),'');
});
test('shareable contact sheet embeds pictures without executing notes or names',()=>{
    const shot=contactShots(demoProject())[0],html=contactHtmlStart('<script>bad()</script>','16:9')+contactCardHtml({...shot,cameraName:'<img onerror=bad()>',notes:'</pre><script>bad()</script>',people:['<iframe>'],image:'data:image/jpeg;base64,abc'});
    assert.ok(html.includes('Content-Security-Policy'));assert.ok(html.includes('data:image/jpeg;base64,abc'));
    assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<iframe>'));assert.ok(html.includes('&lt;script&gt;'));
});
