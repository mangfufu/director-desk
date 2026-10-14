# 导演台 · DirectorDesk

**简体中文** · [English](README.en.md)

**搭场景、排走位、设计运镜，导出你的参考视频。**

面向 AI 短剧与视频创作的三维预演工具。用白模先确定人物站在哪里、怎么走、镜头怎么拍，再把参考视频与配套提示词交给视频生成模型。可以自己操作，也可以让 AI 直接编辑工程。

[下载 Windows 版](https://github.com/mangfufu/director-desk/releases/latest) · [更新记录](https://github.com/mangfufu/director-desk/releases) · [反馈问题](https://github.com/mangfufu/director-desk/issues) · [配套 Skill](skills/director-desk/)

![导演台 0.4.10：左侧布景、右侧摄影机画面，下方编排动作和切镜](docs/images/workspace-0.4.10.jpg)

当前版本 **[0.5.0](https://github.com/mangfufu/director-desk/releases/tag/v0.5.0)** · 新增中英文切换、动作库拖放及右键菜单，改进时间轴插入和拖动预览。

## 从一场戏开始

1. **搭场景**：打开内置模板，或从空白场地开始，放入人物、家具、建筑和道具。
2. **排调度**：安排人物动作与走位，摆放摄影机，在时间轴上调整运镜和切镜。
3. **导出参考**：预览实际摄影机画面，导出视频，再按戏段查看、编辑配套提示词。

摄影机直接从同一个三维场景取景。布景、并排、拍摄三种视图，方便边调整边看结果。

在左侧“动作”中查找内置动作或个人收藏，直接拖入人物轨道。已有片段可拖到另一段前后或两段之间，松手前会显示落点；需要时自动后移后续片段。右键点击片段可以调整时长、在播放头处分割或删除片段；右键点击画布对象可以定位、复制和隐藏。

## 自己制作，或交给 AI

**内置导演助手**：配置模型渠道，用自然语言描述场景和镜头。AI 可以搭景、安排走位、调整运镜；修改后可以定位查看，也可以撤销。还能把选中的人物、轨道片段或时间范围交给 AI，只调整这一部分。

**外部 Agent**：支持 MCP 的 Codex、Claude Code 等 Agent 可以直接操作软件里的当前工程。本机 MCP 默认开启，手动关闭后会记住选择。在 **AI → MCP 连接** 中复制对应配置，再让 Agent 读取内置 Skill，即可开始制作。Claude Desktop 可使用软件附带的本机 stdio 桥接。

![0.4.10 内置导演助手：输入一段舞台调度与镜头要求](docs/images/ai-assistant-0.4.10.jpg)

*上图为任务输入示例，尚未发送。*

配套提示词支持“参考视频”和“纯文本”两种模式，按戏段分别保存。Skill 随软件提供，也支持导入自己的技能并随时启停。

## 把走位画出来

选中人物，在“走位”中选择“手绘”，按住鼠标画出路线，松开后可以继续画。支持地面和物体表面，楼梯、平台也能作为落点。画完仍可修改途经点与时间，摄影机路径同样支持手绘。

![0.4.10 手绘走位：在街道场景中绘制路线并设置时长](docs/images/freehand-path-0.4.10.jpg)

喜欢直接操作，也可以用键盘控制白模并录制走位。位置和动作会进入时间轴，之后继续调整；从中途录制时保留前段调度。

## 普通视频与深度视频

同一套人物、场景和运镜，可以导出普通参考视频，也可以导出灰度深度视频。近远范围、黑白反转与曲线都能调整，也能从当前画面或选中对象取范围。

| 普通画面 | 深度画面 |
| --- | --- |
| ![悬疑长廊的普通摄影机画面](docs/images/depth-color-0.4.10.png) | ![同一时刻、同一摄影机的深度画面](docs/images/depth-depth-0.4.10.png) |

*两张图来自同一场景、同一时刻。深度视频保留人物走位、镜头运动与切镜。*

<details>
<summary>查看深度画面的编辑界面</summary>

![0.4.10 深度预览与范围、曲线控件](docs/images/depth-workspace-0.4.10.jpg)

在摄影机画面下方切换“深度画面”；导出时选择“深度视频”。

</details>

## 更多制作工具

| 你要做的事 | 可用功能 |
| --- | --- |
| 快速搭景 | 内置白模、几何体组合、颜色区分、尺寸调整与物体吸附 |
| 使用自己的资产 | 导入 GLB/glTF、FBX、OBJ 模型；导入动作，收藏到用户动作库 |
| 设计镜头 | 多摄影机、POV、变焦、希区柯克效果、手持晃动、畸变、景深与对焦 |
| 调整画面 | 灯光与阴影、图片／视频表面、镜面、粒子、形变及关键帧 |
| 编排多场戏 | 独立戏段、末帧接拍、时间轴多选、分割和速度曲线 |
| 整理交付 | 单场／批量视频导出、工程保存、素材包、可选人物名称标签 |

**布景复用**：把多个物体编成一组，批量对齐、排列，或存入自己的布景库，下次直接使用。[布景使用方法](docs/staging-workflow.md)。

**动作与物理**：更新人物外形和基础动作，可以选中关节调整姿势，也能开启重力、碰撞、惯性和布娃娃，安排滚动、跌落与受力运动。[物理与动作](docs/physics.md)。

**历史版本**：在“文件 → 历史版本”保存并命名方案，重启后仍可恢复。

**自动避障**：在“场景 → 自动避障”为人物和群演安排地面绕障路线，可让群演错峰通行。目前适用于同高度地面上的静态障碍。

**插件扩展**：在“扩展 → 插件”安装、启用或停用插件，添加新的创作工具和画面效果。[插件开发与示例](docs/plugins.md)。

## 内置场景，打开就能改

以下动图来自软件的实际摄影机输出，按原速播放，降低了分辨率和帧率。

| 夜街追逐 · 奔跑与手持运镜 | 悬疑长廊 · 希区柯克变焦 |
| --- | --- |
| ![夜街追逐实际运镜](docs/images/neon-chase.gif) | ![悬疑长廊实际运镜](docs/images/dolly-hall.gif) |

<details>
<summary>更多模板：光影舞台、卧室、街道、庭院与林地</summary>

| 光影舞台 | 卧室 · 四人调度 |
| --- | --- |
| ![光影舞台](docs/images/light-stage.gif) | ![卧室四人调度](docs/images/bedroom.gif) |
| 空房间 | 林地空地 |
| ![空房间，截取前 8 秒](docs/images/room.gif) | ![林地空地](docs/images/park.gif) |
| 黄昏街道 | 庭院 |
| ![黄昏街道](docs/images/street.gif) | ![庭院](docs/images/courtyard.gif) |

流光空间：粒子、薄膜、镜面和形变。

![流光空间实际摄影机输出](docs/images/abstract-stage.png)

</details>

## 下载与使用

在“编辑 → 设置 → 语言”切换中文或 English，选择会自动记住。

到 [Releases](https://github.com/mangfufu/director-desk/releases/latest) 下载 **Windows 安装版**，或完整解压 **免安装 ZIP** 后运行 `DirectorDesk.exe`。两种版本都包含配套 Skill。

在设置中选择默认工程和导出目录。软件支持官网与 GitHub 检查更新；安装版可下载后重启安装，免安装版下载新的 ZIP。

问题和建议欢迎提交到 [Issues](https://github.com/mangfufu/director-desk/issues)。想参与代码开发或运行网页版，请看 [开发与构建说明](docs/development.md)。

## Star History

<a href="https://www.star-history.com/?repos=mangfufu%2Fdirector-desk&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=dark">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=light">
    <img alt="导演台 GitHub Star 数量随时间变化的曲线" src="https://api.star-history.com/chart?repos=mangfufu%2Fdirector-desk&amp;type=Date&amp;theme=light" width="800">
  </picture>
</a>

## 许可证与友链

项目自有代码采用 [MIT](LICENSE) 许可证。第三方依赖和动作素材保留各自许可，内置动作来源见 [NOTICE](src/animation/library/NOTICE.txt)。

[Linux.do](https://linux.do/)
