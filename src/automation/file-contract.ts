const string = { type: 'string' }, number = { type: 'number' }, boolean = { type: 'boolean' };
const vector = { type: 'array', items: number, minItems: 3, maxItems: 3 };
const destinations = { path: string, directory: string, filename: string, overwrite: boolean };
export const FILE_IMPORT_TOOL = {
    name: 'director_import',
    description: 'Desktop filesystem import without dialogs. Required kind:project|model|motion|staging, absolute path, latest revision, unique requestId. Returns jobId; poll director_job, do not repeat the write. project mode:open(default) replaces the current document with undo; merge inserts sourceSceneId (default source active scene) into the current scene with offset/timeOffset/scheduling:keep|reset/cuts:keep|insert. Model supports GLB/glTF/FBX/OBJ and reads referenced files inside the model directory; dependencies optionally names additional sidecars for FBX resolution. Model name/entityKind/position/unitScale/orientation(radians)/appearance are optional, libraryOnly saves just the resource. Motion supports FBX/GLB/glTF, animationIndex(default0), optional rig mapping, unitScale/orientation; imports into user motion library and returns motionId and mapping status. Use director_motions then motion operation to apply. staging imports a .staging file into the local staging library; use director_staging insert afterward. Source and license are optional user-provided metadata; machine paths are never inserted into project metadata. Invalid files or stale revision leave the project unchanged; library imports are not project undo actions. No file pickers. read director_skill references/files.md for examples.',
    inputSchema: { type: 'object', properties: {
        kind: { type: 'string', enum: ['project', 'model', 'motion', 'staging'] }, path: string, revision: number, requestId: string,
        dependencies: { type: 'array', items: string, maxItems: 256 }, mode: { type: 'string', enum: ['open', 'merge'] }, sourceSceneId: string,
        offset: vector, timeOffset: number, scheduling: { type: 'string', enum: ['keep', 'reset'] }, cuts: { type: 'string', enum: ['keep', 'insert'] },
        name: string, entityKind: { type: 'string', enum: ['actor', 'prop'] }, libraryOnly: boolean, position: vector,
        unitScale: number, orientation: vector, appearance: { type: 'string', enum: ['original', 'white', 'color'] },
        animationIndex: number, rig: { type: 'object' }, license: string, source: string,
    }, required: ['kind', 'path', 'revision', 'requestId'], additionalProperties: false },
};
export const FILE_EXPORT_TOOL = {
    name: 'director_export',
    description: 'kind:prompt exports the authored prompt as TXT, optional sceneId and promptMode:reference-video|text-only. Export project (whole document), screenshot, video, depth-video or bundle. Desktop writes directly, without dialogs: optional absolute path for one file, or directory plus filename; omit destination to use configured project/export directory. Default avoids overwriting by numbering; overwrite:true explicitly replaces. Returns jobId; director_job result.files reports saved:true and actual paths only after disk write finishes. Optional requestId deduplicates retries. Video/depth-video can batch scenes:[{sceneId,filename}]; all use the same selected depth range. Optional format:mp4|webm, fps(default each scene), size:640|1280|1920 long edge, monochrome, cameraId; start/end/cameraId only with one scene. Screenshot uses time(default current preview) and cameraId(default program). Batch cancellation keeps completed files and removes unfinished output; status includes completed files. Browser retains download behavior, explicit desktop paths are rejected. Exported project/media contain no extra machine-path metadata.',
    inputSchema: { type: 'object', properties: {
        kind: { type: 'string', enum: ['project', 'screenshot', 'video', 'depth-video', 'bundle', 'prompt'] }, ...destinations, requestId: string,
        promptMode: {type:'string',enum:['reference-video','text-only']},sceneId:string, start: number, end: number, time: number, size: { type: 'number', enum: [640, 1280, 1920] },
        fps: number, format: { type: 'string', enum: ['mp4', 'webm'] }, monochrome: boolean, cameraId: string,
        scenes: { type: 'array', minItems: 1, items: { type: 'object', properties: { sceneId: string, filename: string }, required: ['sceneId', 'filename'], additionalProperties: false } },
    }, required: ['kind'], additionalProperties: false },
};
