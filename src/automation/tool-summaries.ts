/** Discovery stays small; topic help shares the skill references. */
export const toolSummaries: Record<string, string> = {
    director_reconstruct: 'Extract editable motion from local video. The bundled CPU MediaPipe estimates people and placement. Check state.modes for optional engines and director_help names:[director_reconstruct] for parameters. start/download/import-body need requestId. state reports progress and result gives the .director path to open.',
    director_preview: 'Cache a time range and open its looping preview. build/clear require requestId. Use director_job to follow build.',
    director_import: 'Import an absolute path. Projects default to open. Blender uses local Blender and defaults to a new independent scene (mode:scene). Supply revision/requestId and follow the jobId. See director_help names:[director_import].',
    director_export: 'Save to an absolute path, directory+filename, or the configured folder for that kind. Conflicts number the filename unless overwrite:true. Batch video with scenes. Screenshot uses time/cameraId. Read saved paths via director_job.',
    director_settings: 'Read/set/reset local preferences by scope: editor/files/layout/assets. Read returns supported values/ranges; set uses patch and requestId. Local settings are separate from project undo.',
    director_motion_library: 'Read/update/remove user motion by id. Find with director_motions source:user; import with director_import. details:true includes source bones/nodes. Update patch name/duration/data; data replaces all settings. Writes need requestId; existing scene clips stay unchanged.',
    director_application: 'Desktop skills or updates. scope:skills actions list/read/enable/remove/import/github/reload; data id/path/url/enabled. scope:updates actions state/save/check/download/page. Writes require requestId. Options: help topic:files.',
    director_place: 'Place entityId at optional time: ground (Y=0), seat (targetId/anchorId; replaces whole-scene blocking), detach-hand or freeze-camera (retain evaluated placement). Requires revision/requestId; undoable.',
    director_arrange: 'Align/distribute current-frame bounds or create arrays. Requires revision/requestId/entityIds. align: axis,alignment(min/center/max),anchorId; distribute: axis,alignment, at least 3 objects; array: shape(line/grid/circle),count includes original,step/columns/rowStep/radius/rotate. Moves whole paths; undoable.',
    director_staging: 'Local staging library: list(query/offset/limit), read(id), save(entityIds,name), insert(id,position), rename(id,name), remove(id), export(id,path/directory/filename). Mutations need revision/requestId. Insert edits current scene, reuses sources, preserves cuts and is undoable; library changes are separate. Options: help topic:editing.',
    director_media: 'List imported image/video metadata, inspect entity surface slots, or import local media by path with revision/requestId. Optional entityId attaches imported media. Surface mapping and effects: help topic:media.',
    director_read: 'Read the active scene and revision. Large unfiltered reads give category counts. Use ids or exact entityName, or combine category+query for partial names. Paged results use entityPage.nextOffset. details:true expands matches. sections:[] gives core info. Read selection for the current scope or resourceId for one model.',
    director_assets: 'Find built-in models. searches:[{query,group?,kind?}] returns ranked short lists per need (2 each by default). query/queries supports legacy filtering. Use ids and details:true for addExample and parameter definitions.',
    director_motions: 'Find humanoid motions by query; source:user for user library, builtin(default) for built-ins. Apply returned id via {operation:"motion",id:actorId,asset:motionId,time,duration}; omitted duration uses source default. User motions require complete mapping. Humans/crowds only.',
    director_apply: 'Commit one undoable batch to the active scene using the current revision and a unique requestId. Explicit IDs can be referenced later in the batch. add uses an asset ID (kind only for imported models). update uses id/patch. camera merges top-level fields, nested objects and arrays replace. path:{smooth:false,points:[{time,position:[x,y,z]}]}. cuts uses value:[{time,cameraId}]. motion uses id/asset/time/duration. production.patch updates supplied fields. notes.value replaces all production. preview:true validates only. Commit previewId with a new requestId at the same revision. Use director_help by topic for operation details.',
    director_scene: 'Manage independent scenes. list returns IDs. read supports sections and the same object filters as director_read. Writes need revision/requestId. continue inherits the active scene’s last output frame. new-project replaces the document.',
    director_skill: 'Read the director-desk core guide, one attachment by path, or a custom skill by id. action:list lists enabled skills. Use knownVersion for the core guide already available in this conversation.',
    director_continuity: 'Read saved predecessor story and last-frame positions/poses. Paged offset/limit, nextOffset; sourceStatus reports later source changes. This is the saved handoff; director_spatial queries the live scene.',
    director_spatial: 'Sample a scene/camera. mode:framing with ids and time or times returns compact samples. cameraId:program follows cuts. occlusionKeys:[entity:ID] adds ray samples. Omit mode for full details. depthRange:true suggests near/far.',
    director_scan: 'Optional interval check: start/end/sampleFps,targetKey(entity:ID or all-people),cameraId,occlusion. Returns jobId for director_job. Uses approximate samples.',
    director_nodes: 'Inspect imported entityId node hierarchy and real node bounds; optional time/path/query/offset/limit.',
    director_path_surface: 'Check entityId route height against surfaces; optional surfaceId/clearance/tolerance. Read-only, no route finding.',
    director_stride: 'Estimate humanoid stride for entityId+retarget clipId on a loaded skeleton. Read-only calibration; help topic:project for locomotion parameters.',
    director_view: 'Read/control preview: time,cameraId,entityId/entityIds,clips/timeRange selection,mode(stage/split/shot),focus(home/top/selected),playing/loop/grid. Empty args read state. Seeking pauses unless playing:true. Selection is temporary.',
    director_history: 'Undo/redo one batch: revision and action:undo|redo.',
    director_job: 'Read job status/result by id. waitMs waits up to 10,000 ms and returns early on completion. cancel:true cancels. EDITOR_BUSY may identify the blocking job.',
};

/** Only shorten prose, never change validation constraints. */
export function conciseSchema(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(conciseSchema);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key, v]) => key !== 'description' || typeof v !== 'string' || v.length <= 240)
        .map(([key, v]) => [key, conciseSchema(v)]));
}
