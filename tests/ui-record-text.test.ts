import test from 'node:test';
import assert from 'node:assert/strict';
import { continuityText } from '../src/ui/continuity-text.ts';
import { aiUsageText } from '../src/ui/ai-usage.ts';

test('handoff text shows names, positions and occurred notes without leaking storage fields or future story', () => {
    assert.equal(continuityText({sceneId:'private-id',origin:null}),'本场没有接拍记录。');
    const text = continuityText({sceneId:'private-id',origin:{sceneId:'source-id',sceneName:'第一场',frameIndex:23,time:.96,fps:24,duration:1,
        sourceStatus:'changed',cameraId:'camera-id',description:'internal schema instructions',
        objects:[{key:'object-key',entityId:'actor-id',memberIndex:null,name:'人物甲',kind:'actor',position:[1,2,3],forward:[0,0,1],action:'run',enabled:false,bounds:null}],
        notes:[{id:'note-id',actorId:'actor-id',start:0,end:2,story:'追逐仍在继续',emotion:'紧张',dialogue:'快走！',action:'奔跑',timing:'continues-beyond-source'}],
        notStartedNotes:[{id:'future-id',actorId:'actor-id',start:3,end:4,story:'尚未发生的事件',emotion:'',dialogue:'',action:''}]
    }});
    assert.match(text,/人物甲（已隐藏） · 跑步/); assert.match(text,/X 1.00 · Y 2.00 · Z 3.00 米/);
    assert.match(text,/台词：快走！/); assert.match(text,/延续至本场/);
    assert.doesNotMatch(text,/private-id|actor-id|source-id|object-key|schema|notStartedNotes|尚未发生的事件/);
});

test('usage display handles provider formats and missing values without raw JSON', () => {
    assert.equal(aiUsageText({prompt_tokens:12,completion_tokens:8}),'本轮用量：输入 12 · 输出 8 tokens');
    assert.equal(aiUsageText({input_tokens:12,output_tokens:0}),'本轮用量：输入 12 · 输出 0 tokens');
    assert.equal(aiUsageText({total_tokens:20}),'本轮用量：共 20 tokens');
    assert.equal(aiUsageText({input_tokens:NaN,other:'private'}),'本轮用量未提供');
    assert.equal(aiUsageText(null),'本轮用量未提供');
});
