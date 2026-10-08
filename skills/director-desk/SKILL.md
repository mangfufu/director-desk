---
name: director-desk
description: 使用导演台工具编辑白模预演，或生成可导入的 .director 工程。适用于布景、走位、运镜和预演检查；纯分镜文案或图像生成不使用。
---

# 导演台

默认编辑当前工程、当前戏段；用户要求新建、复制或接拍时另建。

- **已连接 MCP**：用 `director_skill` 读取当前核心说明；本对话已有同版本时复用。按任务读取附件。
- **网页版或未连接 MCP**：读[离线工程](references/project-format.md)，用自包含 `scripts/project-tool.mjs` 制作 `.director`，需要 Node.js 22+。无脚本环境可参考[最小工程](assets/minimal.director)，交付时说明未自动校验。保留已有戏段、资源和未改字段。
- **旧工具无技能入口**：读[核心操作](references/online-workflow.md)。

完成戏段与分镜时，默认配齐参考视频、纯文字两份提示词，按[提示词写作](references/prompt-writing.md)分别保存。只改设置或用户不要时省略，明确只要一种时遵从。纯文本单条视频上限未确认时询问用户，已确认则沿用。

## 按需读取

| 任务 | 说明 |
| --- | --- |
| 对象、编组、排列、动作、选区与接拍 | [编辑](references/editing.md) |
| 打开、导入导出、时间轴与本机设置 | [文件与控制](references/files.md) |
| 运镜、镜头效果、灯光 | [镜头与灯光](references/camera.md) |
| 媒体表面、粒子、形变 | [媒体与抽象元素](references/media.md) |
| 重力、碰撞、惯性、布娃娃 | [物理](references/physics.md) |
| 插件、命名版本、群演自动避障 | [扩展与版本](references/extensions.md) |

交付离线工程后说明用「打开」导入。文件结构校验与实际画面检查分别说明；凭据和本机私有目录不写入工程或提示词。
