const fs=require('node:fs/promises');
const path=require('node:path');
exports.activate=async api=>({
    async statistics({points}){
        const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
        const result={points:points.length,length:Number(length.toFixed(3))};
        await fs.writeFile(path.join(api.dataDirectory,'last-statistics.json'),JSON.stringify(result));return result;
    },
    async inspect(){return api.callTool('director_read',{sections:[]});},
});
