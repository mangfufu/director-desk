# 导演台 · DirectorDesk

**简体中文** · [English](README.en.md)

面向 AI 视频创作的三维预演工具。搭建场景、编排人物动作与走位、设计运镜，导出参考视频和配套提示词。支持手动编辑，也支持 AI 直接操作工程。

[下载 Windows / Linux 版](https://github.com/mangfufu/director-desk/releases/latest) · [更新记录](https://github.com/mangfufu/director-desk/releases) · [问题反馈](https://github.com/mangfufu/director-desk/issues)

![布景、摄影机画面与时间轴](docs/images/workspace-current-zh.png)

当前发布版：[0.5.5.1](https://github.com/mangfufu/director-desk/releases/tag/v0.5.5.1)。

## 核心功能

| 功能 | 用途 |
| --- | --- |
| 场景与资产 | 内置人物、道具和场景模板；支持几何体搭景及 GLB/glTF、FBX、OBJ 模型导入 |
| Blender 工程 | 直接选择 `.blend`，借助本机 Blender 导入布景、摄影机、灯光和动画，无需安装插件 |
| 动作与走位 | 动作库、动作导入、手绘路径、键盘操控录制；调整姿势与物理效果 |
| 摄影机 | 多机位切镜、变焦、希区柯克效果、手持晃动、镜头畸变与景深 |
| 时间轴 | 拖放、吸附、多选、分割、速度曲线；控制对象出现和消失的时段 |
| 画面 | 灯光、阴影、图片与视频表面、镜面、粒子、形变及关键帧 |
| 工程与交付 | 多戏段、末帧接拍、命名历史版本；批量导出普通视频或深度视频 |
| 预览与检查 | 镜头联系表、局部预览缓存、构图辅助线 |

## 场景演示

从空白场地开始，也可以直接打开模板修改人物、布景和镜头。以下动图来自软件实际摄影机输出，按原速播放，降低了分辨率和帧率。

| 夜街追逐：奔跑、跟拍与手持晃动 | 悬疑长廊：希区柯克变焦 |
| --- | --- |
| ![夜街追逐](docs/images/neon-chase.gif) | ![悬疑长廊](docs/images/dolly-hall.gif) |
| **光影舞台：灯光与镜头变化** | **卧室：四人调度** |
| ![光影舞台](docs/images/light-stage.gif) | ![卧室四人调度](docs/images/bedroom.gif) |
| **黄昏街道** | **庭院** |
| ![黄昏街道](docs/images/street.gif) | ![庭院](docs/images/courtyard.gif) |
| **林地空地** | **空房间** |
| ![林地空地](docs/images/park.gif) | ![空房间，截取前 8 秒](docs/images/room.gif) |

## AI 操作

- **内置助手**：配置模型渠道后，用自然语言搭景、安排动作和调整镜头。可指定人物、片段或时间范围，查看修改位置并撤销。
- **外部 Agent**：通过 MCP 连接 Codex、Claude Code 等客户端，直接编辑当前工程。在 **AI → MCP 连接** 复制配置；Claude Desktop 可使用内置 stdio 桥接。
- **配套提示词**：每场戏分别保存参考视频提示词和纯文字提示词。[内置 Skill](skills/director-desk/) 可独立检查更新，也可导入自己的 Skill。

![内置助手中的任务输入示例，尚未发送](docs/images/assistant-current-zh.png)

AI 与手动编辑可以交替使用。例如先让 AI 搭建街道和追逐路线，再手动调整其中一个镜头；也可以选中几段轨道，让 AI 只修改这一部分。

## 动作、走位与时间轴

在动作库中查找内置动作或用户收藏，悬停预览，直接拖入人物轨道。已有动作之间也能插入片段，松手前显示落点，需要时后移后续片段。支持导入动作资源，也可以使用导入模型自带的动画。

- **手绘走位**：按住鼠标画出路线，之后继续调整途经点、高度和时间；楼梯、平台等物体表面也能作为落点。
- **操控录制**：用键盘控制人物移动，R / F 上升、下降，将走位录入时间轴，再继续编辑。
- **时间编辑**：多选片段一起移动，拖动两端调整时长；通过右键菜单在播放头处分割或删除片段。
- **姿势与物理**：选择关节调整姿势，按需启用重力、碰撞、惯性和布娃娃，设计掉落、抛掷与受力运动。
- **出现与消失**：调整对象的显示片段，让人物或道具只在需要的时间出现，仍保留在工程中。

## 摄影机、灯光与画面效果

布景、并排、拍摄三种视图，方便一边调整场景，一边查看实际摄影机画面。用多个摄影机安排切镜，分别编辑机身路径与视线，调整经过、停住、加速与减速的节奏。

支持变焦、POV、希区柯克效果、手持晃动、镜头畸变、景深与对焦；通过灯光和阴影安排画面层次。复杂工程可使用自适应预览，减少拖动和播放时的负担，停止调整后恢复完整画面。

图片或视频可以贴到多种物体表面，并调整裁剪、位置、缩放、旋转和透明度。镜面、粒子、线面结构与形变也能组合使用，通过关键帧控制变化。

![流光空间：粒子、镜面与形变的实际摄影机输出](docs/images/abstract-stage.png)

## 普通视频与深度视频

同一套场景、走位和镜头，可以导出普通参考视频，也可以导出灰度深度视频。支持调整近远范围、黑白反转和曲线，并从当前画面或选中对象取范围。

| 普通画面 | 同一摄影机、同一时刻的深度画面 |
| --- | --- |
| ![普通摄影机画面](docs/images/depth-color-0.4.10.png) | ![对应的深度画面](docs/images/depth-depth-0.4.10.png) |

![深度预览与范围调整](docs/images/depth-current-zh.png)

单场或批量导出多个戏段，可调整文件名、分辨率与帧率。每场戏的参考视频提示词和纯文字提示词分别保存，方便继续用于视频生成。

## 资产、工程与扩展

| 你要做的事 | 使用方式 |
| --- | --- |
| 继续使用 Blender 布景 | 在“文件 → 导入 Blender 工程”选择 `.blend`，自动调用本机 Blender，导入模型、基础颜色贴图、摄影机、灯光与动画，默认放到独立戏段 |
| 复用自己的布景 | 把物体编组，批量对齐、排列，保存到布景库，下次直接放入场景 |
| 安排多场戏 | 各戏段独立编辑，也可以从上一段末帧接拍，继续人物与道具的状态 |
| 保留多个方案 | 命名保存工程历史版本，关闭软件后仍可恢复；日常编辑支持撤销与自动恢复 |
| 安排多人走位 | 为人物和群演生成绕开静态障碍的地面路线，设置错峰通行 |
| 检查镜头节奏 | 用镜头联系表集中查看画面、时间和备注，导出 HTML 分享；按需开启构图辅助线 |
| 回看复杂片段 | 生成指定时间区间的预览缓存，再循环播放检查 |
| 扩展工具 | 安装插件，添加自定义面板、工具、画面效果和导出方式；导入自己的 Skill 并随时启停 |

Blender 导入侧重可编辑的布景和调度，保留基础外观；复杂程序材质不会按原渲染器效果完整复现。

[布景使用方法](docs/staging-workflow.md) · [物理与动作](docs/physics.md) · [插件接口与示例](docs/plugins.md)

## 安装与使用

- **Windows**：运行安装包，或完整解压便携 ZIP 后运行 DirectorDesk.exe。
- **Linux x64**：给 AppImage 添加执行权限后运行；也可解压 tar.gz 使用。已在 Ubuntu 24.04 / WSL 2 验证。
- **语言**：在 **编辑 → 设置 → 语言** 切换中文或英文。首次启动跟随系统语言，非中文环境默认英文，手动选择优先。
- **更新**：Windows 安装版和 Linux AppImage 支持下载并重启更新；便携版下载后手动替换。

[开发与构建](docs/development.md) · [插件接口](docs/plugins.md) · [布景操作](docs/staging-workflow.md)

## 视频提取动作

在 **视频反推** 中选择视频和时间区间，查看识别预览，完成后打开为可编辑工程。可更换人物外形，裁剪、调速或替换动作，继续编辑走位。

默认的**简易识别**基于 [MediaPipe Pose Landmarker Lite](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)，已随软件内置，无需额外安装，在本机运行，无需独立显卡。提取人物动作与近似位置，不还原原视频场景和运镜。安装、存储和清理在视频反推设置中管理。

![简易识别的动作预览](docs/images/lightweight-current-zh.png)

## 许可与致谢

导演台自有代码采用 [MIT](LICENSE)。第三方组件、模型和素材遵循各自许可：

- [MediaPipe · Apache 2.0](desktop/video-reconstruction/MediaPipe-LICENSE.txt)
- [Human3R](https://github.com/fanegg/Human3R) · [非商业许可](desktop/video-reconstruction/Human3R-LICENSE.txt)
- [FlowHMR](https://github.com/flowhmr/flowhmr) / [Windows 适配](https://github.com/xiaoerofficial021-collab/FlowHMR-Windows) · [模型许可](desktop/video-reconstruction/FlowHMR-LICENSE.txt)；SMPL+H 人体文件另遵循其官方许可
- [动作素材来源与许可](src/animation/library/NOTICE.txt)

## Star History

[![GitHub Star History](https://api.star-history.com/chart?repos=mangfufu/director-desk&type=Date)](https://www.star-history.com/#mangfufu/director-desk&Date)

友链：[Linux.do](https://linux.do/)
