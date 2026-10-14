# 本地开发与构建

[返回项目介绍](../README.md)


准备 Node.js 24+ 和 npm：

```bash
git clone https://github.com/mangfufu/director-desk.git
cd director-desk
npm ci
npm run dev
```

按终端显示的地址打开网页。要启动 **Electron 桌面开发版**（包含内置 AI、MCP 和桌面文件功能），执行：

```bash
npm run desktop:dev
```

这个命令复用 `desktop:prepare`，先构建网页与独立桌面运行目录，再启动 Electron，无需制作安装包。Windows 和 macOS 使用同一命令。首次使用需安装本机 Chrome，或通过 `CHROME_PATH` 指定 Chrome 路径。

开发版默认将配置、会话和自动恢复数据保存在 `.local/desktop-dev-profile/`，与安装版分开，重启后保留。源码修改后重新运行 `desktop:dev`；此入口不提供热更新。如果没有改代码，只想再次打开已经准备好的版本，可以运行：

```bash
npm run desktop:start
```

可通过 `npm run desktop:dev '--' --remote-debugging-port=9222` 传入 Electron 调试参数；网页开发仍使用支持热更新的 `npm run dev`。

首次运行测试，先准备公开测试素材（固定版本、校验下载内容并自动解压）：

```bash
npm run test:assets
npm test
```

素材只保存在不入库、不打包的 `test-assets/external/`，已有校验通过的文件可离线复用。来源、许可文件与 SHA-256 见 `scripts/test-asset-sources.json` 及素材目录；缺少素材时测试会明确提示，不会静默跳过。无需测试时，启动和构建软件不需要下载这些素材。

验证后构建网页或 Windows 安装包：

```bash
npm run build
npm run desktop:pack
```

macOS（Apple Silicon）构建 DMG：

```bash
npm run desktop:pack:mac
```

网页产物位于 `dist/`，桌面交付文件位于 `release/`（Windows 为 `DirectorDesk-Setup-<版本>.exe`，macOS 为 `DirectorDesk-<版本>-arm64.dmg`）。桌面构建使用本机 Chrome，可通过 `CHROME_PATH` 指定浏览器。macOS 包未做签名和公证，首次打开如被 Gatekeeper 拦截，请右键点击应用选择“打开”；macOS 版暂不支持应用内自动更新，请从发布页下载新版本。

发布 Windows GitHub Release 时，将构建生成的 `release/latest.yml` 与同版本安装包一起上传，保留文件名。更新客户端按清单校验下载包；缺少清单的历史 Release 仍可检测版本并打开下载页。

从 0.4.8 起支持四段修订号，例如 `0.4.8.1`。三段版本在 `package.json` 的 `version` 与 `shortVersion` 中填写相同值；四段版本使用 `version: "0.4.8+revision.1"`、`shortVersion: "0.4.8.1"`，以兼容 npm 和 Electron。界面、安装包文件名与 GitHub 标签使用四段版本；构建生成的更新清单保留原样即可。更新按四段数字比较，`0.4.8 < 0.4.8.1 < 0.4.9`；早于 0.4.8 的客户端需先升级到 0.4.8。

| 目录 | 内容 |
| --- | --- |
| `src/` | 场景、编辑器、动画、渲染和共用自动化工具 |
| `desktop/` | 桌面入口、AI 协议、MCP 服务和更新客户端 |
| `skills/director-desk/` | 技能说明与离线工程工具 |
| `scripts/`、`tests/` | 构建与验证工具 |

## 当前开发

动作库现位于左侧“动作”页，支持分类、搜索，以及将内置／用户收藏动作拖入人物动作轨道。可在右侧继续调整原有动作参数，用户动作导入和映射仍使用“导入 / 管理”。轨道拖动与动作库拖入按鼠标所在的片段左／右半边插在前／后，冲突片段保持时长向后让位；多选保持时间偏移；实块跟随鼠标，虚影与插入线显示落点，空隙按鼠标位置判断、分界线提供 8px 吸附范围。预览不修改工程、不移动原轨道，也不重复采样 3D 动作，松手一次提交、一次撤销。UI 共用 `src/editor/timeline-insertion.ts`；MCP／离线 `motion` 仍按明确时间找空位，精确重排可用 `clips`／`path.sections` 补丁，不添加指针语义或工程字段。启动开发服务后运行 `node scripts/verify-motion-library.mjs` 与 `node scripts/verify-timeline-insertion.mjs`（默认端口 5178，可通过 `DIRECTOR_URL` 指定），验证原有资源、播放、缩放滚动以及前后插入、多选、撤销取消；截图位于 `output/playwright/`。

文件交互已统一：桌面保存绑定当前工程路径，另存为使用 `Ctrl/⌘+Shift+S`；文件路径和保存点属于本机会话历史，不写入 `.director`。撤销跨工程操作时一并恢复文件关联，恢复副本单独保存路径与未保存状态。MCP 打开／导出工程复用同一保存状态。

桌面视频导出与 MCP 共用 `src/files/desktop-output.ts` 分块原子写入；取消清理未完成文件，重试跳过同一工程版本、规格及目标目录下已完成的视频。导出偏好仅存本机。`tests/document-file-state.test.ts`、`tests/export-retry.test.ts` 和 `scripts/test-interactions-desktop.mjs` 验证这些流程。

当前源码新增对象编组、对齐与阵列、用户布景库，使用入口、共用契约及验证方式见[布景编辑与复用](staging-workflow.md)。已包含在 0.4.11 版本中。
新增人形动作与可选通用物理，见[物理与动作](physics.md)。23 个默认人形动作使用 `src/assets/authored-human-actions.ts` 的手工关键姿态，已替换原默认成品曲线与公式动作；原有动作素材库和导入功能仍保留。关节节点在布景窗口选择及旋转，右侧三轴偏移使用共用 pose/poseKeys，保持旧单轴工程兼容。`node scripts/verify-human-actions.mjs` 生成全部基础动作的真实渲染检查图，并验证多种人形随机跳帧；`node --experimental-strip-types --test tests/physics.test.ts` 验证共用数据与求值，`node scripts/verify-physics.mjs` 验证界面和导出，`node scripts/test-physics-desktop.mjs` 验证隔离桌面配置与真实 MCP。

人物曲面由 `src/assets/human-surfaces.ts` 的平滑截面生成；骨架与接拍节点路径保持兼容。手工动作通过 `src/animation/authored-curve.ts` 的五次 Hermite 曲线匹配关键帧速度与加速度。衔接期间继续求值前一个动作，不能改成定格姿态后再混合。`tests/human-motion-quality.test.ts` 检查曲线与实际骨骼速度、衔接边界、轮廓法线及模型成本；`node scripts/verify-human-motion-playback.mjs` 逐帧检查 23 个动作并生成完整 60fps 播放视频，输出保存在非发布目录。
## 界面语言

界面语言在 `src/i18n/` 维护：内置文案按完整标签匹配，动态标签用明确的占位格式；新功能应补齐英文术语。界面层保留原文以支持即时往返切换，不修改输入值、option 的 value、工程数据或 MCP 协议。用户名称与第三方内容使用 `data-i18n-ignore`；动态标题应仅翻译固定部分。桌面原生弹窗使用 `desktop/language.cjs`，与界面选择同步。

验证：`node --experimental-strip-types --test tests/locale.test.ts`；开发服务器上运行 `node scripts/verify-language.mjs`；`npm run desktop:prepare` 后运行 `node scripts/verify-language-desktop.mjs`。后者使用隔离配置并检查原生弹窗参数，不操作用户工程或发起模型请求。
