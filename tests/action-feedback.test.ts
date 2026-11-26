import test from 'node:test';
import assert from 'node:assert/strict';
import {withActionFeedback} from '../src/ui/action-feedback.ts';

function element(){const attrs=new Map<string,string>();return {
    getAttribute:(key:string)=>attrs.get(key)??null,
    setAttribute:(key:string,value:string)=>attrs.set(key,value),
    removeAttribute:(key:string)=>attrs.delete(key),
} as unknown as HTMLElement;}
test('pending command has feedback, avoids duplicate work, and does not block cancel',async()=>{
    const button=element();let finish!:()=>void,count=0,cancelled=false;
    const run=withActionFeedback(async action=>{
        if(action==='cancel'){cancelled=true;return;}
        count++;await new Promise<void>(resolve=>finish=resolve);
    },()=>assert.fail('unexpected error'));
    const pending=run('open',button);
    await new Promise(resolve=>setTimeout(resolve,170));assert.equal(button.getAttribute('aria-busy'),'true');
    await run('open',element());assert.equal(count,1);
    await run('cancel',element());assert.equal(cancelled,true);
    finish();await pending;assert.equal(button.getAttribute('aria-busy'),null);
    const retry=run('open',button);assert.equal(count,2);finish();await retry;
});
test('failed load reports a usable message, allows retry, and ignores cancellation',async t=>{
    t.mock.method(console,'error',()=>{});
    const messages:string[]=[];let attempts=0;
    const run=withActionFeedback(async()=>{attempts++;if(attempts===1)throw Error('Failed to fetch dynamically imported module: director://app/assets/old.js');if(attempts===3)throw new DOMException('cancel','AbortError');},message=>messages.push(message));
    const button=element();await run('open',button);await run('open',button);await run('open',button);
    assert.equal(attempts,3);assert.deepEqual(messages,['页面加载失败，请重新打开软件后重试。']);assert.equal(button.getAttribute('aria-busy'),null);
});
