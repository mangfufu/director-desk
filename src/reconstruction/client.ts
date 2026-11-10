export async function reconstruction(action:string,data?:Record<string,unknown>){
    if(!window.directorDesktop?.reconstruction)throw Error('视频反推需要桌面版');
    const result=await window.directorDesktop.reconstruction(action,data);
    if(!result.ok)throw Error(result.error||'操作失败');return result.data;
}
