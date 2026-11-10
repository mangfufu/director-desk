# 文件、时间轴与编辑器控制

桌面版已连接时直接使用路径接口，不调用文件选择弹窗。路径只作为工具参数和本机保存结果，不写入工程元数据。网页版离线工程继续使用 `scripts/project-tool.mjs`；没有桌面文件接口时不声称已保存到指定路径。

## 导入与打开

`director_import` 必填 `kind`、绝对 `path`、最新 `revision`、唯一 `requestId`。返回 `jobId` 后用 `director_job({id})` 查询，完成前不要重复发起导入。

- `kind:"project"`：`.director`。`mode:"open"`（默认）替换当前文档，可撤销；`mode:"merge"` 将来源当前戏段或指定 `sourceSceneId` 合入当前戏段。合并支持 `offset:[x,y,z]`、`timeOffset`、`scheduling:"keep"|"reset"`、`cuts:"keep"|"insert"`。
- `kind:"model"`：GLB/glTF/FBX/OBJ，自动读取模型目录内实际引用的关联文件，不扫描上传整个目录。`dependencies` 可列出 FBX 需要的额外关联文件。可设 `name/entityKind/position/unitScale/orientation/appearance/rig`，`libraryOnly:true` 只存入工程资源。朝向用 XYZ 弧度，位置用米。
- `kind:"motion"`：FBX/GLB/glTF 骨架动作，`animationIndex` 默认 0，导入本机用户动作库。返回 `motionId` 及映射状态，用已有 `motion` 操作添加到人物；库本身不随工程撤销。
- `kind:"staging"`：导入 `.staging` 到布景库，随后用 `director_staging insert` 放进当前戏段。`director_staging export` 也接受 `path/directory/filename/overwrite`，直接保存文件。

用户明确要求新建整个工程时，使用 `director_scene({action:"new-project",template,name,revision,requestId})`；`create` 只是新增独立戏段。两者都可撤销。

模型的 `source/license` 是用户提供的来源及许可说明，不能自行填入私人目录作为来源。

## 导出

`director_export({kind,...})` 支持 `project/screenshot/video/depth-video/bundle`。

`kind:"prompt"` 导出已保存的 TXT，可指定 `sceneId` 和 `promptMode:"reference-video"|"text-only"`；省略沿用当前戏段及其显示模式。缺少成稿时返回错误，不自动编造内容。

`kind:"contact-sheet"` 导出独立 HTML 镜头联系表，可指定 `sceneId`，默认当前戏段。每个切镜附真实摄影机缩略图、时间、取样人物和重叠剧情备注；人物为标注时刻的有限可见性采样，不保证整段可见。图片内嵌，可离线打开或打印。不接收视频规格参数，不改工程；离线工程脚本不渲染缩略图。

### 局部预览缓存

`director_preview({action:"build",start,end,size:640,cameraId:"program",requestId})` 预计算当前戏段范围，返回 `jobId`，用 `director_job` 查询或取消。`state` 读取就绪范围；`open` 打开循环预览；`clear` 配合 `requestId` 清除缓存。UI 在“场景 → 局部预览”，默认使用时间选区，没有选区时从当前时间取最多五秒。

缓存仅保留本次运行的压缩画面（最多 64 MiB／3600 帧，640 或 1280 长边），不写磁盘、不进入工程、不替代正式输出。当前实现画面内容改变后整个缓存范围失效；只修改剧情备注不会失效。修改范围／摄影机／分辨率须重新生成，不承诺只补算被改的帧。离线工程工具不渲染缓存。

- 单文件指定绝对 `path`；或 `directory` 加 `filename`（带正确扩展名）。省略目录使用软件默认工程／导出目录。
- 默认重名编号另存；用户要求覆盖时传 `overwrite:true`。
- 可传唯一 `requestId`，重试相同请求返回原任务，不重复导出。
- 视频可传 `scenes:[{sceneId,filename}]` 批量导出，filename 可不带扩展名。支持 `format:"mp4"|"webm"`、`fps`（省略沿用各戏段）、`size:640|1280|1920`（长边）、`monochrome`。
- `start/end/cameraId` 仅限单戏段；截图用 `time/cameraId`，省略为当前时间和节目机位。
- 深度批量导出共用当前选定的深度范围。
- 返回 `jobId`。仅当 `director_job` 返回 `result.files` 中 `saved:true`，才报告实际 `path` 已保存。取消用 `{id,cancel:true}`，已完成文件保留，未完成输出清理。

## 时间轴

通过 `director_apply` 同批事务中的 `operation:"timeline"` 编辑，无需重写整个动作数组。`patch.selection` 为 `{kind:"action",entityId,id}`、`{kind:"path",entityId,index}` 或 `{kind:"cut",index}`。

`patch.action`：`split` 使用 `time`；`remove` 删除；`move` 使用 `delta` 秒；`extend` 使用 `delta` 延长右端；`range` 精确设置 `start/end`。分割保留动作采样相位，移动动作遇到重叠会顺排，切镜移动是调整连续镜头顺序、延长会顺延后续切镜。沿用界面的锁定、最短一帧及校验规则。

## 动作库与预览

- `director_motion_library`：`read/update/remove` 指定用户动作 `id`。更新 `patch` 支持 `name/duration/data`，data 完整替换，所以先读再改。支持骨架映射、单位、朝向、循环、原地运动及衔接设置，来源资源和动画序号不可替换。写入要带唯一 `requestId`。修改库不会追溯改写已加入工程的片段。
- 适配时按问题修改现有字段：`data.orientation` 为 XYZ 弧度；`data.unitScale` 为源素材单位；`data.motion` 省略时保留素材位移，原地播放使用 `{mode:"inPlace",node:rig.bones.hips}`；`data.grounding` 可用 `{mode:"preventPenetration",maxCorrection:0.2}`。先读后改，保留其他设置。已排片段修改对应 `clips[].retarget`，不要误改收藏来修正工程。界面动作库可在源模型／默认人物间切换、暂停拖动检查；无场景路径的预览按素材时间播放，路程驱动需在实际走位中检查。
- `director_view`：空参数读当前状态；可设置 `time/cameraId/entityId/entityIds/clips/timeRange`，以及 `mode:"stage"|"split"|"shot"`、`focus:"home"|"top"|"selected"`、`playing/loop/grid`。跳时间默认暂停，需边跳边播时显式 `playing:true`。选区不修改工程，不构成权限边界。
- `director_settings`：`scope:"editor"` 的 `read` 返回操作偏好、默认值及范围；`set` 传 `patch`，`reset` 恢复默认。`scope:"files"` 支持 `read/set`，patch 为绝对目录 `projects/exports`。写入要带唯一 `requestId`，这是本机设置，不进入工程撤销。

## 其他编辑操作

同批 `director_apply` 还支持：
- `lock`：`id,value:true/false`；先单独解锁，再修改原锁定对象。
- `duplicate`：单个 `id` 或 `value:[entityIds]`，`position` 为复制偏移，复用编组复制的关联重映射。
- `position-key`：`id,time,position`，时间按帧对齐，保留现有路径。
- `draw-path`：`id,patch:{points:[[x,y,z],...],time,duration,tolerance?}`，使用自由绘制的三维简化及距离计时，替换该对象路径。
- `record-motion`：`id,patch:{time,mode:"auto"|"crawl"|"keep",segments:[{duration,keys:["KeyW","ShiftLeft"],forward:[0,0,1]}]}`，复用白模操控录制，保留前缀，写入普通路径及动作。WASD 水平、RF 升降、Shift 跑动；不支持摄影机录制。精确节奏直接编辑路径点时间。

`director_place` 根据求值模型定位，带 `entityId/revision/requestId` 及可选 `time`：`ground` 对齐 Y=0；`seat` 用空间查询返回的 `targetId/anchorId` 静态就座并替换人物整场动作；`detach-hand` 保留当前位置解除手持；`freeze-camera` 保留摄影机姿态解除跟随。共用界面定位、校验与撤销。

## 本机设置与技能

- `director_settings scope:"layout"`：read/set/reset，patch 为 sidebar/inspector/timeline 像素及 split 百分比，实际尺寸受窗口约束。
- `director_settings scope:"assets"`：read 返回收藏和最近使用；set 的 patch 为 `{id,favorite:boolean}`。
- `director_application scope:"skills"`：list/read/enable/remove/import/github/reload，data 按操作传 id/path/url/enabled；import 必须传绝对路径，不弹文件框。内置 AI 运行时技能变更沿用软件规则，需结束当前任务后执行。不要自行更换用户技能或清空对话。
- `director_application scope:"updates"`：state/save/check/download/page，save 的 data 为既有更新源配置。实际重启安装仍由更新界面执行。变更操作带唯一 requestId；设置不进入工程文件。

## 视频反推

桌面版 `director_reconstruct`：`open` 打开面板，`state` 查询模型及最新任务。首次使用由用户在界面确认 Human3R 非商业许可，Agent 不代为同意。`download` 下载运行环境；`start` 接收绝对视频 `path`、`start`、`seconds`（0 到结尾）、`fps`（3/6/12）和 `scene`（`none` 仅人物及摄影机；`planes` 人物＋简化平面，默认；`mesh` 人物＋环境网格）。非零时长在 3/6/12 fps 下分别至少为 0.7/0.4/0.2 秒；不足两帧的视频区间会被拒绝。下载、转换传唯一 `requestId`，立即返回，继续用 `state` 查询，`cancel` 取消。

`result` 返回完成的 `.director` 路径，再按用户意图用 `director_import` 打开或合并；转换本身不替换当前工程。离线工具可编辑转换结果，不执行模型推理。结果仍需检查，原始预测和程序后处理不能当成人工修正后的效果。

Windows / Linux x64 原生运行，需要 NVIDIA 显卡，无需预装 Python 或 WSL。`configure` 的 `runtimeRoot` 选择空目录或已有受管目录，模型、依赖、缓存及结果均集中存放；`storage` 查询占用。`preview` 按需返回当前分析帧、时间和人物数量，不返回图片；界面可同时查看原视频帧和识别预览。

`preview` 加 `history:true` 返回可回看的帧序号及时间；传 `frame` 查询其中某帧，不返回图片。

转换成功或取消后自动清理中间文件，保留工程、识别预览及日志。`clear-cache` 清理受管缓存和已结束任务的中间文件；`remove-runtime` 移除模型、运行环境和缓存，保留转换结果。进行中的任务必须先结束；不会删除所选目录内的其他文件。

配置任务的 `job.steps` 按步骤返回 pending/running/completed/failed/cancelled，`job.detail` 和 downloadedBytes/totalBytes 提供当前下载状态；无需读取完整日志。识别过程以骨架预览，生成工程的人物模型保持原有方式。

界面在转换完成后提供人物外形选择和同步播放；选择在打开工程时应用，未打开前不改当前戏段。Agent 复用 `director_import` 打开结果，再用 `replace-actor` 按需更换人物外形；无需重新转换，操作见 `editing.md`。原识别模型和已适配人物共用原来的动作、走位和显示时段。

转换前的人物模型与分析精度、还原内容、场景同级。`start` 可传 `actorModel`：`source`（默认）保留识别模型，或指定内置人形资产 ID，生成的工程直接使用所选外形和适配动作。任务 `input.actorModel` 保留选择，旧任务缺省按 `source`；单独换某个人物仍使用 `replace-actor`。

配置状态中的 `job.downloadFile` 为当前下载文件名（不含本机目录）；`installation` 保留最近成功配置的总用时与步骤，即使最新任务已切换为视频转换仍可查询。

新配置默认使用简易识别（mediapipe），已有选择保留；state 返回当前 engine、ready，以及 modes 中两种方式的就绪状态、许可与来源。按需 configure 切换识别方式。未就绪时 download 安装约 21 MB 的可选模型，复用 requestId 和异步任务查询。此方式使用 CPU，无需 Human3R 环境和许可确认。start 仅支持 scene:none，可传 people:1–10（默认 3）及内置 actorModel；source 会使用标准成年人物。结果保留可编辑动作、近似位置和显示时段，摄影机固定，不还原场景或原相机。configure(engine:human3r) 切回标准识别，原有许可要求不变。离线工具可以编辑生成的工程，不执行视频识别。
