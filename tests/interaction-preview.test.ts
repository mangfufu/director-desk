import test from 'node:test';
import assert from 'node:assert/strict';
import { InteractionPreview } from '../src/editor/interaction-preview.ts';
import { editSettings } from '../src/automation/settings.ts';

test('temporary preview activates only on consecutive slow interactive frames and resets on release',()=>{
    const preview=new InteractionPreview();
    preview.record(100);assert.equal(preview.draft,false);
    preview.update(true,true);preview.record(30);preview.record(5);preview.record(30);assert.equal(preview.draft,false);
    assert.equal(preview.record(25),true);assert.equal(preview.draft,true);
    preview.record(2);assert.equal(preview.draft,true,'no quality flicker in the same drag');
    assert.equal(preview.update(false,true),true);assert.equal(preview.draft,false);
    preview.update(true,true);preview.record(30);assert.equal(preview.draft,false,'new drag starts fresh');
    preview.record(30);preview.update(true,false);assert.equal(preview.draft,false);
    preview.record(100);assert.equal(preview.draft,false);
});

test('composition guides and adaptive preview use the same atomic MCP preference patch',async()=>{
    const before=await editSettings({scope:'editor',action:'read'});
    assert.ok('values' in before && before.values);
    try{
        const next=await editSettings({scope:'editor',action:'set',patch:{guideThirds:true,guideCenter:true,guideSafe:true,adaptivePreview:false}});
        assert.ok('values' in next && next.values);
        assert.equal(next.values.guideThirds,true);assert.equal(next.values.adaptivePreview,false);
        await assert.rejects(editSettings({scope:'editor',action:'set',patch:{guideThirds:false,guideSafe:'yes'}}));
        assert.deepEqual(await editSettings({scope:'editor',action:'read'}),next);
    }finally{await editSettings({scope:'editor',action:'set',patch:before.values});}
});

test('known texture-heavy scenes start reduced preview on the first drag frame and restore on release',()=>{
    const preview=new InteractionPreview();
    assert.equal(preview.update(true,true,true),true);assert.equal(preview.draft,true);
    assert.equal(preview.update(false,true,true),true);assert.equal(preview.draft,false);
    preview.update(true,false,true);assert.equal(preview.draft,false);
});
