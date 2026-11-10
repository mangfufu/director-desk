import test from 'node:test';
import assert from 'node:assert/strict';
import {minimumAnalysisDuration,assertAnalysisDuration,normalizeVideoRange} from '../src/reconstruction/interval.ts';

test('a shorter source resets an out-of-range start instead of creating a zero-looking interval',()=>{
    assert.deepEqual(normalizeVideoRange(40,50,5,.4),{start:0,end:5});
    assert.deepEqual(normalizeVideoRange(2,4,5,.4),{start:2,end:4});
    assert.deepEqual(normalizeVideoRange(4.8,5,5,.4),{start:0,end:5});
    assert.deepEqual(normalizeVideoRange(0,10,.12,.4),{start:0,end:.12});
    assert.throws(()=>assertAnalysisDuration(.12,6),/至少 0.4/);
});

test('UI precisions provide multiple analysis frames and reject incomplete ranges',()=>{
    for(const [fps,minimum] of [[3,.7],[6,.4],[12,.2]]){
        assert.equal(minimumAnalysisDuration(fps),minimum);
        assert.doesNotThrow(()=>assertAnalysisDuration(minimum,fps));
        assert.throws(()=>assertAnalysisDuration(.01,fps),/区间/);
        assert.ok(Math.ceil(minimum*fps)>=2);
        const range=normalizeVideoRange(1,1,5,minimum);
        assert.ok(range.end-range.start>=minimum-1e-9);
    }
    for(const fps of [0,NaN,Infinity,25])assert.throws(()=>minimumAnalysisDuration(fps),/帧率/);
});
