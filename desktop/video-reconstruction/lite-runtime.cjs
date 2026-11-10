const fs=require('node:fs/promises'),path=require('node:path');
const {downloadFile,digest}=require('./download.cjs');
const MODEL={name:'MediaPipe Pose Lite',bytes:5777746,sourceUrl:'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker',licenseUrl:'https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE',licenseText:'MediaPipe — Apache License 2.0.\nhttps://github.com/google-ai-edge/mediapipe/blob/master/LICENSE'};
const sdk='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/';
const FILES=[
 {file:'runtime/lite/vision_bundle.mjs',url:sdk+'vision_bundle.mjs',bytes:156062,sha256:'b65acb59b370cd6561afd9d04c29ed7a87e7ed6386922ac1b263af1f1ad06b7d'},
 {file:'runtime/lite/vision_wasm_internal.js',url:sdk+'wasm/vision_wasm_internal.js',bytes:334128,sha256:'f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b'},
 {file:'runtime/lite/vision_wasm_internal.wasm',url:sdk+'wasm/vision_wasm_internal.wasm',bytes:14603354,sha256:'f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab'},
 {file:'models/pose_landmarker_lite.task',url:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',bytes:MODEL.bytes,sha256:'59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'},
];
async function ready(root){try{for(const item of FILES){const file=path.join(root,item.file);if((await fs.stat(file)).size!==item.bytes||await digest(file)!==item.sha256)return false;}return true;}catch{return false;}}
async function install(root,{task,signal,fetch}){let done=0;const total=FILES.reduce((s,f)=>s+f.bytes,0);task.steps=[{id:'lite-download',label:'下载轻量模型',status:'running',startedAt:Date.now()}];for(const item of FILES){task.message='下载轻量模型';task.downloadFile=path.basename(item.file);await downloadFile(item,root,{signal,fetch,progress:(n)=>{task.downloadedBytes=done+n;task.totalBytes=total;task.progress=(done+n)/total*100;}});done+=item.bytes;}}
module.exports={FILES,MODEL,ready,install};
