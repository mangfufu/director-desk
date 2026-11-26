---
name: director-desk
description: 在导演台或离线 .director 工程中搭景、安排走位和镜头，编写项目的参考视频版、纯文字版配套提示词。
---

# 导演台

默认编辑当前工程的当前戏段。按最新改稿和已确认的制作规格工作。用户要求新建、复制或接拍时另建。

- **连接 MCP**：用 `director_skill()` 读[核心操作](references/online-workflow.md)，已有同版本说明时复用。按需用 `director_help({operations:["motion"]})` 查[常用操作示例](references/operations.md)。
- **离线制作工程**：用 [离线工程工具](references/project-format.md) 编辑、校验并交付可打开的 `.director`，需要 Node.js 22+。无脚本环境可参考[最小工程](assets/minimal.director)，如实说明校验情况。
- **只改或写文稿**：按[提示词写作](references/prompt-writing.md)直接交付，沿用用户指定的输出位置。

完成戏段与分镜后，默认分别保存参考视频版和纯文字版。按用户要求选择成稿种类。新项目的单条生成时长上限未知时，先询问用户并等待回答。局部改稿沿用已有规格，仅更新受影响的内容与衔接。

## 按需读取

| 任务 | 说明 |
| --- | --- |
| 对象、编组、排列、动作、选区与接拍 | [编辑](references/editing.md) |
| 打开、导入导出、时间轴与本机设置 | [文件与控制](references/files.md) |
| 运镜、镜头效果、灯光 | [镜头与灯光](references/camera.md) |
| 参考视频版、纯文字版提示词 | [提示词写作](references/prompt-writing.md) |
| 媒体表面、粒子、形变 | [媒体与抽象元素](references/media.md) |
| 重力、碰撞、惯性、布娃娃 | [物理](references/physics.md) |
| 插件、命名版本、群演自动避障 | [扩展与版本](references/extensions.md) |
