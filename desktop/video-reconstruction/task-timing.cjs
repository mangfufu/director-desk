// Progress is weighted by pipeline stage, so this is an estimate, not a deadline.
function conversionTiming(task, now=Date.now()) {
    if(task?.kind!=='convert'||!Number.isFinite(task.startedAt))return {};
    const ended=Number.isFinite(task.finishedAt)?task.finishedAt:now;
    const elapsedSeconds=Math.max(0,(ended-task.startedAt)/1000);
    const progress=Number(task.progress);
    const estimatedRemainingSeconds=task.status==='running'&&elapsedSeconds>=10&&progress>=15&&progress<100
        ?Math.max(1,Math.round(elapsedSeconds*(100-progress)/progress)):null;
    return {elapsedSeconds,estimatedRemainingSeconds};
}
module.exports={conversionTiming};
