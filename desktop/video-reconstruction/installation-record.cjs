const fs=require('node:fs/promises'),path=require('node:path');
function installationRecord(task){
    const {id,kind,status,message,progress,startedAt,finishedAt,elapsedSeconds,steps}=task;
    return {id,kind,status,message,progress,startedAt,finishedAt,elapsedSeconds,steps};
}
async function previousInstallation(root,marker){
    if(marker.installation)return marker.installation;
    // Existing installs already have per-task records; recover their receipt once.
    let latest=null;
    try{for(const entry of await fs.readdir(path.join(root,'runs'),{withFileTypes:true})){
        if(!entry.isDirectory())continue;
        try{const task=JSON.parse(await fs.readFile(path.join(root,'runs',entry.name,'task.json'),'utf8'));
            if(task.kind==='download'&&task.status==='completed'&&(!latest||task.startedAt>latest.startedAt))latest=installationRecord(task);
        }catch{}
    }}catch{}
    return latest;
}
module.exports={installationRecord,previousInstallation};
