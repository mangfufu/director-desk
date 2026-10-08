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
