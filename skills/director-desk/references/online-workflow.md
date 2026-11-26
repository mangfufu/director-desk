# 导演台核心操作

默认编辑当前工程的当前戏段。用户要求新建、复制或接拍时另建。普通编辑直接提交，格式未知时可预检。

## 查询与编辑

- 复用已知数据和最新 `revision`。大场景默认返回类别和数量。已有 ID 用 `ids`，已知完整名称用 `entityName`，可同时指定 `category`。名称只知道一部分时用 `query`。调整选区时读 `sections:["selection"]`，其他内容按需取对应分区。
- 在 full 模式用 `director_assets({searches:[{query:"书桌",group:"桌台柜架"},{query:"台灯"}]})` 按需求独立返回少量候选。已知 ID 按需查 `details:true`。geometry 模式用快照里的形状。几何人物用命名的 prop 胶囊和路径表达走位。
- 单位米／秒，+Y 向上，人物 +Z 向前。`rotation` 为弧度，`pose` 为度。只查取景用 `director_spatial({mode:"framing",ids:["对象 ID"],times:[2,4],cameraId:"program"})`。需要站位或边界时取完整报告。program 随切镜。
- 同一 `revision` 的关联编辑可用一个 `operations` 批量提交，附唯一 `requestId`，一次撤销。内置助手的 `sameBatchAs` 指向同一批的完整回执，提交结果和 revision 共用。版本冲突或结果未确认时，先核对最新状态再修正。
- `camera` 与 `production` 补丁合并顶层字段，其他嵌套对象和数组整体替换。`cuts` 与旧 `notes` 用完整 `value`。替换前按需读取原内容。
- 文件任务返回 `jobId` 后，用 `director_job({id:"任务 ID",waitMs:1500})` 等完成或取进度。`EDITOR_BUSY` 附带 job 时等 job.id，再继续采样或编辑。

完成戏段及分镜后，按 [提示词写作](prompt-writing.md) 分别保存 `promptText`、`textOnlyPrompt`，用户可指定一种。只要求文稿时直接写稿。新项目的单条生成时长上限未知时先询问用户，等回答后再安排时间。

## 按需帮助

`director_help({operations:["path","motion"]})` 一次取所需示例。完整专题用 `topic` 或对应附件。要核对工具参数用 `names`（1–3 项），可加 `full:true`。`operations`、`topic`、`names` 分开使用。

| topic | path／离线说明 |
| --- | --- |
| editing | [对象、动作、编组与接拍](editing.md) |
| camera | [镜头与灯光](camera.md) |
| production | [两种提示词的写作与保存](prompt-writing.md) |
| media | [媒体、视觉元素与形变](media.md) |
| physics | [通用物理与动作](physics.md) |
| files | [路径导入导出、时间轴与设置](files.md) |
| extensions | [插件、命名版本与自动避障](extensions.md) |
| project | [离线工程及高级参数](project-format.md) |
