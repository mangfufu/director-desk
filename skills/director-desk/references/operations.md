# 常用操作示例

调用时替换示例的对象 ID、当前 revision 和 requestId。在线用 `director_help({"operations":["motion"]})` 按需读取操作示例。离线可将示例中的 `operations` 交给工程工具的 `apply`。

## new-project

`director_scene({"action":"new-project","template":"blank","name":"新工程","revision":123,"requestId":"new-project-1"})`

仅在用户要求新建工程时使用。name 设置工程名称。戏段名称用 `director_scene({"action":"rename","sceneId":"戏段 ID","name":"戏段名称","revision":124,"requestId":"rename-1"})`。现有工程内新增独立戏段用 action:"create"。

## read

`director_read({"sections":["entities"],"category":"摄影机","query":"侧面"})`

已知 ID 用 ids，完整名称用 entityName。只取 revision 和基本信息用 sections:[]。查询当前选区用 sections:["selection"]，取一个对象完整参数用 ids 搭配 details:true。同名结果用 ID 区分。

## assets

`director_assets({"searches":[{"query":"书桌","group":"桌台柜架"},{"query":"台灯","group":"道具"},{"query":"light-point","group":"灯光"}]})`

每项返回独立候选，默认两项。limit 是每项上限。found:false 表示该项没有匹配。拿到 ID 即可按默认尺寸添加。需要自定义尺寸时用 `director_assets({"ids":["furniture-desk"],"details":true})`，按返回的 parameterPatchField 写参数值。几何体模式优先用 director_read 的 geometry。

## add

`director_apply({"revision":123,"requestId":"add-1","operations":[{"operation":"add","asset":"furniture-desk","id":"desk-a","name":"书桌","position":[1,0,2]}]})`

内置资产按资产 ID 添加，省略 kind。后续操作可在本批引用显式 ID。自定义尺寸时先查该资产的 parameterPatchField 和参数范围。

## update

`director_apply({"revision":123,"requestId":"move-1","operations":[{"operation":"update","id":"desk-a","patch":{"position":[1,0,3]}}]})`

位置使用米，+Y 向上。旋转使用弧度。关联编辑可合进同一 operations，按当前 revision 提交；冲突时重新读取改动涉及的对象。

## path

`director_apply({"revision":123,"requestId":"path-1","operations":[{"operation":"update","id":"actor-a","patch":{"path":{"smooth":false,"points":[{"time":0,"position":[0,0,0]},{"time":3,"position":[2,0,1]}]}}}]})`

点位时间用秒且严格递增。path 整体替换。保留用户已有的关键点、朝向和剪辑段时，先按 IDs 查完整路径。角色动作可在同批添加。

## motion

`director_motions({"query":"坐"})` 查动作 ID。

`director_apply({"revision":123,"requestId":"motion-1","operations":[{"operation":"motion","id":"actor-a","asset":"basic-sit","time":0,"duration":4}]})`

id 是人物／群演 ID，asset 是动作 ID。duration 用秒，省略时沿用动作默认时长。需要全段坐姿时指定对应时长。

## camera

`director_apply({"revision":123,"requestId":"camera-1","operations":[{"operation":"update","id":"camera-a","patch":{"position":[2,1.5,4],"camera":{"mode":"free","aim":"target","target":[0,1.2,0],"targetId":"","focal":45}}}]})`

camera 合并顶层字段，数组和嵌套对象整体替换。focal 用毫米。更复杂的路径、跟随、景深与镜头效果按需读 camera 主题。

## cuts

`director_apply({"revision":123,"requestId":"cuts-1","operations":[{"operation":"cuts","value":[{"time":0,"cameraId":"camera-a"},{"time":4,"cameraId":"camera-b"}]}]})`

value 是完整切镜数组，首项从 0 秒开始，时间严格递增。局部修改前按需查 `director_read({"sections":["cuts"]})`。

## lighting

`director_apply({"revision":123,"requestId":"light-1","operations":[{"operation":"add","asset":"light-point","id":"light-a","position":[1,2.4,1],"patch":{"color":"#ffe2bb"}}]})`

默认强度来自资产。调整强度或范围时，先读该灯的 light，用保留其他字段的完整对象替换。全局灯光和镜头效果参见 camera 主题。

## framing

`director_spatial({"mode":"framing","ids":["actor-a","actor-b"],"times":[3.95,4.05],"cameraId":"program"})`

program 随切镜选实际摄影机。归一化矩形的左上为 (0,0)，右下为 (1,1)。intersecting 表示有裁切，not-checked 表示遮挡尚未采样。按需传 `occlusionKeys:["entity:actor-a"]`，采样会考虑画面中的其他对象。单时刻可用 time。完整空间报告看同一工具省略 mode 的结果。

## production

`director_apply({"revision":123,"requestId":"prompts-1","operations":[{"operation":"production","patch":{"promptText":"参考视频版正文","textOnlyPrompt":"纯文字版正文"}}]})`

只写需要更新的顶层字段。具体文稿要求见 prompt-writing.md。

## screenshot

`director_export({"kind":"screenshot","time":4.05,"cameraId":"program","size":640,"filename":"构图.png","requestId":"frame-1"})`

桌面指定路径或文件名可直接生成 PNG。收到 jobId 后用 director_job 等待，读取实际保存路径。

## export-project

`director_export({"kind":"project","filename":"工程.director","requestId":"save-1"})`

桌面版可传绝对 path。仅在任务返回 saved:true 时报告实际文件已保存。

## export-video

`director_export({"kind":"video","format":"mp4","size":1280,"filename":"参考视频.mp4","requestId":"video-1"})`

默认导出整段和原帧率。start/end 可选择范围，cameraId:"program" 随切镜。用 director_job 取实际保存路径。批量导出时给 scenes 与 directory。

## job

`director_job({"id":"本次任务 ID","waitMs":1500})`

任务完成会提前返回，等待上限到达时可能仍为 running。查看即时状态省略 waitMs，取消用 cancel:true。若其他操作返回 EDITOR_BUSY 并附 job，直接等 job.id。对于手动编辑或 UI 任务，等待当前操作结束。
