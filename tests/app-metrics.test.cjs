const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppMetrics } = require('../desktop/app-metrics.cjs');
const processMetric = (pid, seconds, kb, creationTime = 1) => ({ pid, creationTime, cpu: { cumulativeCPUUsage: seconds }, memory: { workingSetSize: kb } });

test('app CPU uses interval deltas across processes and RAM converts KiB to bytes', () => {
    let time = 0, calls = 0, rows = [processMetric(1,10,1024), processMetric(2,4,2048)];
    const sample = createAppMetrics(() => { calls++;return rows; }, { cores:4,now:()=>time });
    assert.deepEqual(sample(),{cpu:null,memoryBytes:3*1024**2});
    time = 500;assert.equal(sample().cpu,null);assert.equal(calls,1,'rapid requests reuse one sample');
    rows = [processMetric(1,11,1024), processMetric(2,6,2048)];time = 2000;
    assert.equal(sample().cpu,37.5);
});
test('unavailable counters and reused PIDs do not produce invented zero usage', () => {
    let time=0,rows=[processMetric(1,10,1024)];
    const sample=createAppMetrics(()=>rows,{cores:2,now:()=>time});sample();
    time=2000;rows=[processMetric(1,1,1024,2)];assert.equal(sample().cpu,null);
    time=4000;rows=[{pid:1,creationTime:2}];assert.deepEqual(sample(),{cpu:null,memoryBytes:null});
    time=6000;rows=[];assert.deepEqual(sample(),{cpu:null,memoryBytes:null});
});
