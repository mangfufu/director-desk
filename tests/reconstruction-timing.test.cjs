const {test}=require('node:test'),assert=require('node:assert/strict');
const {conversionTiming}=require('../desktop/video-reconstruction/task-timing.cjs');
test('conversion time advances and estimates only after initial progress',()=>{
    const task={kind:'convert',status:'running',startedAt:1000,progress:5};
    assert.deepEqual(conversionTiming(task,6000),{elapsedSeconds:5,estimatedRemainingSeconds:null});
    task.progress=25;
    assert.deepEqual(conversionTiming(task,21000),{elapsedSeconds:20,estimatedRemainingSeconds:60});
    assert.equal(conversionTiming(task,31000).elapsedSeconds,30);
    task.progress=NaN;assert.equal(conversionTiming(task,31000).estimatedRemainingSeconds,null);
});
test('finished, cancelled and failed jobs freeze elapsed time and remove estimates',()=>{
    for(const status of ['completed','failed','cancelled'])assert.deepEqual(conversionTiming({kind:'convert',status,startedAt:1000,finishedAt:61000,progress:50},900000),{elapsedSeconds:60,estimatedRemainingSeconds:null});
    assert.deepEqual(conversionTiming({kind:'download'}),{});
    assert.deepEqual(conversionTiming({kind:'convert'}),{});
});
