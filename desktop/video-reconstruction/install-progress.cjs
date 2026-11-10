const stages=[['components','下载基础组件'],['model','下载识别模型'],['extract','解压组件'],['python','准备运行环境'],['compute-download','下载计算组件'],['compute-install','安装计算组件'],['dependencies','安装识别依赖'],['verify','检查显卡']];
function beginStage(task,id,detail=''){
    task.steps??=stages.map(([id,label])=>({id,label,status:'pending'}));
    const index=task.steps.findIndex(step=>step.id===id);if(index<0)throw Error('Unknown installation stage');
    const now=Date.now();
    for(const step of task.steps)if(step.status==='running'){step.status='completed';step.finishedAt=now;}
    const step=task.steps[index];step.status='running';step.startedAt=now;delete step.finishedAt;
    delete task.downloadFile;task.message=step.label;task.detail=detail;task.stage=id;delete task.downloadedBytes;delete task.totalBytes;
}
function finishStages(task,status){
    for(const step of task.steps||[])if(step.status==='running'){step.status=status;step.finishedAt=Date.now();}
    delete task.downloadedBytes;delete task.totalBytes;delete task.detail;delete task.downloadFile;
}
module.exports={beginStage,finishStages};
