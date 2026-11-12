# 内置轻量识别

桌面版随包提供 MediaPipe Pose Lite 和 WebAssembly 运行组件，总计约 21 MB。运行时直接读取应用资源，不安装 Python/CUDA、不联网下载，也不复制到用户存储目录。保留 MediaPipe Apache 2.0 许可及来源。此变更不包含 FlowHMR、Human3R 或 SMPL+H 文件。

## 构建与文件边界

- `lite-runtime.cjs` 固定四个资源的 URL、长度和 SHA-256。
- `prepare-bundled-lite.mjs` 在构建时获取文件，缓存统一存放于 `tmp/build-downloads/mediapipe`，只将校验通过的四个文件复制到桌面暂存区的 `video-reconstruction/lite`。
- `desktop/builder.cjs` 用同一清单纳入安装包资源；桌面隐私检查同时核对长度和哈希，缺失或损坏时构建失败。
- 宿主优先使用经过校验的内置文件；未带内置资源的开发宿主保留原下载流程。内置资源与可清理的用户目录分离。

## 管理和自动化

- `state.modes.mediapipe.bundled` 标识内置能力。新配置默认简易识别；已有用户选择不变。
- 内置时 `download` 不重复安装；`start` 沿用原异步识别、取消和结果导入。
- `storage.bundledBytes` 单列应用内组件体积；原 `total` 继续表示用户目录占用。
- `remove-runtime(engine:mediapipe)` 只清理旧版额外下载的组件，不移除内置能力或转换结果；设置中对应“清理旧组件”。

## 本次验证

- 宿主测试覆盖全新配置、无网络请求、无需安装、切换存储位置、清理旧组件及正确选用内置资源。
- Windows 桌面隔离配置完成真实 1 秒、6 帧视频识别，生成含人物动作的可编辑工程；主进程外部 fetch 禁用，识别工作页仅允许本机任务资源。
- 清理后保留生成工程和识别就绪状态，用户目录没有重复的模型文件。
- 此次桌面实测为 Windows；Linux 共用相同资源和代码，未将其算作本次 Linux 实机验收。
