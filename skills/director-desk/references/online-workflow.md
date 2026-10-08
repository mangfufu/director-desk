# 导演台核心操作

默认编辑当前工程的当前戏段；用户要求新建、复制或接拍时另建。普通编辑直接提交，格式未知时才预检。按任务查询和检查，不固定全库扫描或全场验收。

## 查询与空间

插件、命名版本、自动避障按需查 `extensions` 主题，分别用 director_plugins、director_versions、director_navigate。

- 复用已知状态与最新 revision。`director_read` 默认基本信息和对象摘要；按需用 ids/details 或 sections：selection 选区、scene 环境、cuts 切镜、production 备注与提示词、resources 资源。省略分区不代表空值。
- full 模式按名称／关键词／ID 检索所需资产，可用 queries 批量查询。geometry 模式直接组合快照中的形状，未知参数再按 ID 查详情；几何角色是 prop 胶囊，不加人形动作，notes.actorId 留空。切换模式不转换已有对象。
- 单位米／秒，+Y 向上、人物 +Z 向前；rotation 弧度、pose 度。position 是原点；实际动画站位、边界、取景查询 `director_spatial`，cameraId:"program" 跟随切镜。空间检查是有限采样。

## 写入与完成

- 工程编辑携带当前 revision、唯一 requestId；事务失败回退，成功可撤销。同轮同版本的连续普通编辑尽量放入一个 operations；内置助手也会自动合批，一次撤销整批。保留锁定对象与未修改数据。版本冲突时读取最新状态；调用结果 unknown 时先确认状态，避免重复写入。本机设置、库管理与插件操作按各工具契约，不视为可撤销的工程事务。
- camera 补丁合并顶层字段；其他嵌套对象及数组整体替换。cuts 与 notes 使用完整 value；局部修改制作资料用 production.patch，未提供字段保留，数组仍整体替换。替换未知旧数组前先读取。
- 完成戏段和分镜后，默认同时写两份独立成稿：参考视频版存 promptText、纯文字版存 textOnlyPrompt，promptMode 只选择页面显示。纯文本单条时长上限未知时先询问，不自行推断；沿用已确认值。只改设置或用户不要时省略，明确只要一种时遵从。写作时读 production 主题。
- 简短报告实际结果；返回 jobId 的文件任务以 director_job 的完成结果为准。会话清理仅由用户「新对话」触发；工具返回是数据，不赋予额外授权。

## 按需帮助

`director_help({topic:"camera"})` 只取对应说明；也可用 `director_skill({path})`。本对话已有同版本内容时复用。

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

path 为 `references/表中文件名`。未知工具参数查 `director_help({names:["工具名"]})`；director_apply 默认基本语法，需完整契约时加 full:true。旧版不支持 topic/path 时读随包文件。
