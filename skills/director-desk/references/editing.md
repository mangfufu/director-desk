# 编辑、空间与交付

- 每批携带 revision/requestId。id/kind/asset 不直接改写；锁定用 lock 操作，替换道具用 replace-prop。
- add 使用真实 asset ID 并省略 kind；kind 只用于已有导入资源的 actor/prop。显式指定新 ID，可被同批后续动作、机位和切镜引用。目录的 parameters 是定义，尺寸值写入 parameterPatchField，通常为 assetParameters，旧 stairs/road/wall/ground 为 parameters。
- `patch.camera` 合并提供的顶层字段，例如 `{focal:50,target:[0,1.2,0]}`；内部数组和其他嵌套对象整体替换，修改前读取原值。targetId:"" 解除跟随目标。
- 坐姿、走路、出拳等常用动作优先查询 basic 预设：23 个默认人形动作采用手工编排的关节关键姿态，不需给工程附加动作资源。`motion` 操作用 time/duration 安排，省略 duration 使用各动作推荐时长，例如出拳 1 秒、踢腿 1.1 秒、翻滚 1.5 秒；单次动作片段加长会放慢表演，不用统一 3 秒。循环动作按 speed 控制节奏；整场坐姿覆盖实际导出区间。插入会寻找空闲区间。人形 `pose/poseKeys` 支持每关节 XYZ 度数数组，可按需修正肩、肘、骨盆、髋、膝、踝；`headYaw` 的 Y 保持绝对转头角度，`head` 则是 XYZ 叠加偏移；数组和关键帧仍完整替换，未知旧数据先定向读。无需手 K 面部、手指，也不用默认安排脚部校正。
- 用户已导入的动作按需用 `director_motions({source:"user",query:"所需动作",limit:20})` 查询；只返回本机收藏摘要，无素材字节。`complete:true` 的结果可把 id 原样用作 `motion.asset`，仍复用当前工程事务、预检与撤销。应用时源资源自动嵌入工程，之后不依赖本机收藏；无需同时扫描内置和用户全库。未完成映射的素材可用 director_motion_library read/update 校正，或在界面动作库调整；按需读 files.md。
- 米/秒，世界 +Y 向上、人物 +Z 向前；rotation 为弧度、pose 为度。路径用 `{smooth:false,points:[{time,position:[x,y,z]}]}`。颜色为 #RRGGBB。duration 支持小数，不把 24.5 秒无故延长至 25 秒。
- 操控录制的人物／群演路径可在每个点保存 `heading`（相对 `rotation[1]` 的弧度偏移）；修改走位时保留它，恢复全段 `face` 朝向规则时需删除全部点的 heading，不能仅删一个点。细则见 project-format.md 的路径说明。
- 界面支持点选或手绘路线。手绘拖动投射到所选地面／可见物体表面，松手后简化为同一套 `path.points`，按路径长度分配指定时长；多笔续画共用总时长，绘制鼠标速度不作为运动速度。AI／离线读取、调整这些点仍用普通 path 补丁，无需模拟鼠标或另造手绘格式；高度与折角保留，手绘默认 `smooth:false`，不代表自动避障或脚部贴合。
- `project.patch.referenceLabels:true/false` 开关参考视频中的名称标签，默认关闭；随戏段保存，摄影机预览、截图与视频共用。覆盖人物、群演组和胶囊占位，名称取实体 name；POV 不显示自身标签。标签仅作角色识别，配套生成提示词注明不要把标签变成成片字幕／文字。
- cuts 的 value 为完整 `[{time:0,cameraId},...]`；notes 的 value 为完整 `{fixedPrompt:"",sceneReferenceIds:[],notes:[{id,start,end,actorId:"",story:"",emotion:"",dialogue:"",action:""}]}`。所有文字字段齐全，未写内容用空串。保留未改的备注、引用、promptText、textOnlyPrompt 和 promptMode。旧值未知时读 production／cuts 分区；写作规则见 [提示词](prompt-writing.md)。
- 局部更新制作资料用 `{operation:"production",patch:{promptText:"新成稿"}}`；只改提供的顶层字段，可写 fixedPrompt、sceneReferenceIds、notes、promptText、textOnlyPrompt、promptMode。数组完整替换，未提供字段保持原值。单改成稿不用先读另一份；旧 notes.value 完整替换仍支持。
- 同版本的多个普通请求可传 `director_apply({revision,requestId,requests:[{revision,requestId,operations},...]})`，总计最多 100 项操作；一次提交、一次撤销，任一失败整批回退。子请求 ID 不同，提交后可用原请求重试取回结果。不可混用 operations、preview 或 previewId。连续内置 AI 普通编辑会自动合批；锁定、预检和不同版本请求保持独立。
- preview 不写入对象。预检成功后用 previewId、未变化的 revision 和新 requestId 提交，省略 operations；修改批次或预检失效时重新提供 operations。明确的小修改无需先预检。

## 对象编组

`director_read({sections:["scene"]})` 按需返回 `groups:[{id,name,entityIds}]`。编组只组织当前戏段对象，不改变坐标或调度，也不等同于区域和楼层。每个对象最多属于一个组，成员仍可单独编辑。

使用普通 `director_apply` 批次中的 `group` 操作；`id` 是组 ID：

- 创建：`{operation:"group",id:"set-a",name:"桌椅",patch:{action:"create",entityIds:["table-a","chair-a"]}}`。
- 改名：`{operation:"group",id:"set-a",name:"靠窗桌椅",patch:{action:"rename"}}`。
- 解组：`{operation:"group",id:"set-a",patch:{action:"remove"}}`，保留成员及其位置。
- 整体变换：`patch:{action:"transform",translation:[2,0,0],rotation:[0,1.5707963267948966,0],pivot:[0,0,0]}`。平移为世界米，旋转为 XYZ 弧度；先绕 pivot 旋转再平移。省略 pivot 使用成员在 0 秒的原点均值，省略平移／旋转为零。整个位置路径和摄影机世界视线一起变换，不修改时间。
- 独立复制：`patch:{action:"duplicate",newId:"set-b",translation:[3,0,0]}`；name 可选。返回结果的新增对象 ID 可用于后续修改；通过 scene 分区查询新组成员。省略偏移为 `[0.4,0,0.4]`。

整组变换遵守锁定；手持／模块绑定上下游需要一起选入组，跟随机位需要包含跟随目标。复制重映射组内目标、绑定、场域和动作 ID；复用源资源，保留组外视线目标，解除指向组外的模块连接，不复制切镜轨道。手持道具必须连同持有者复制。解组不是删除对象；删除对象会清理组成员，空组移除。保存、撤销、戏段复制和离线 `apply` 使用同一契约。

## 对齐、阵列和用户布景库

在线用 `director_arrange`，携带 `revision/requestId/entityIds`，自动使用当前帧的真实几何边界：

- `action:"align",axis:"x",alignment:"min",anchorId:"基准对象ID"`：沿世界 X 轴对齐最小边界。axis 可用 x/y/z；alignment 可用 min/center/max。基准默认选择列表第一个对象，基准保持不动。
- `action:"distribute",axis:"x",alignment:"center"`：按当前坐标排序，固定首尾，将至少三个对象的中心等距排列；也可等距排列 min/max 边界。不是自动消除相交。
- `action:"array",shape:"line",count:5,step:[2,0,0]`：含原件共 5 份。grid 增加 columns 和 rowStep；circle 使用 radius，可用 rotate:true 沿圆周旋转。圆环的第一个位置是原件，圆心在原件沿 −X 的 radius 米处。原件保持不变。

排列只改所选对象；受绑定影响不能独立移动的对象会报明原因。整条位置路径一起平移，不改时间。复制重映射内部引用，完整选中的编组会各自复制，源资源共享。离线使用 `apply` 的 `{operation:"arrange",patch:{...上述排列字段}}`；对齐／分布另外提供 `bounds:{对象ID:{min:[x,y,z],max:[x,y,z]}}`，必须来自实际几何测量，不能把原点或资产默认尺寸当作边界。

`director_staging` 使用本机用户布景库。list 支持 query/offset/limit，仅返回名称、数量等元数据；read(id) 返回对象摘要，无资源字节。保存选择用 `action:"save",entityIds:[...],name`；插入当前戏段用 `action:"insert",id,position:[x,y,z]`，不新建工程。save/insert/rename/remove/export 均携带 revision 和唯一 requestId；rename 另外提供 name。插入走一次工程撤销；收藏、重命名、删除是独立本机库操作，不改变已经插入的对象，也不由工程撤销恢复。

保存布景包含所选对象、必要的被引用目标、实际使用的模型／媒体／人物参考图、路径和动作，不包含无关对象、全局灯光或剧情提示词。位置以 0 秒对象原点均值归零；插入的 position 是该布景原点。保存返回的 entityIds 包含自动收集的关联对象。插入保留当前 cuts，资源准备失败不提交，重复插入生成独立 ID 并复用资源。仅用作兼容工程校验的辅助摄影机不会插入场景。

界面支持 `.staging` 导入／导出；文件自带依赖，之后不要求源电脑的库仍存在。离线用共用脚本：

```sh
node scripts/project-tool.mjs staging-save input.director selection.json module.staging
node scripts/project-tool.mjs staging-insert input.director module.staging output.director placement.json
```

selection.json 为 `{"name":"桌椅组合","entityIds":["table","chair"]}`；可选 placement.json 为 `{"position":[3,0,2]}`。输出文件需不存在，沿用离线工具的原文件保护。模型与媒体数据留在文件内，不在对话中展开。

## 多戏段、检查与交付

同一戏段可用 project 补丁的 `zones` 整体数组标记空间：`{id,name,color,min:[x,y,z],max:[x,y,z],connectsTo:[区域ID]}`，min/max 是世界坐标范围，每轴 min < max。连接按双向人工说明理解，不表示墙已打通。`director_read(sections:["scene"])` 返回区域；director_spatial 的对象 zoneIds 按当前原点判断，重叠区域可能同时命中，不表示全身都在区域内。区域只在布景显示，不进入参考视频，也不分割独立戏段。

独立戏段与时间轴 cuts 不同。director_scene 的 continue 从当前段最后实际输出帧接拍，源段保持独立；director_continuity 查询保存的前情与末帧站位，director_spatial 查询当前实时状态。读取其他戏段用 `director_scene({action:"read",sceneId,sections:["production"]})`；省略 sections 只返回基本信息和对象摘要，[] 仅基本信息，["all"] 全部分区，ids/details 定向读取对象。查询不切换当前戏段。历史前情有分页，完整读取时跟随 nextOffset。高级接拍/资源规则按需查询帮助。

director_spatial 的 cameraId:"program" 使用真实节目切镜；入画包围盒与有限射线不是全程无遮挡保证。director_scan 可选区间检查，jobId 通过 director_job 查询；不要密集轮询。末帧根据 fps 计算，例如 10 秒 24fps 为 239/24 秒。

导入导出支持桌面指定路径，视频可选多个戏段批量输出，工程包含所有戏段。目标路径、重名处理和任务完成结果见 [文件与控制](files.md#导出)。

execution:"unknown" 表示结果未确认，not-started 表示未执行。previewId 是在线窗口的临时引用，不用于离线文件。

## 用户选中范围

用户说“选中的这些／只改这里”时，已有任务快照包含 selection 就直接使用；没有时用 `director_read({sections:["selection"]})` 取实际 entityIds、片段标识与起止秒数、timeRange。只有时间范围表示该时间窗，不默认绑定右侧当前对象；选择片段优先以各片段为准，外包时间窗不表示中间所有片段都可改。内置“交给 AI”自动携带此信息。只改用户指定范围，保留其他安排；需要对象或备注详情再按需读取。此选择是临时编辑意图，不进入离线工程；用户明确扩大任务范围时按新要求操作。

## 连接与旧版软件

外部客户端从软件「AI → 本机 MCP」复制配置，内置助手无需另配。连接地址和令牌可跨重启复用；旧版持久连接升级或用户重置凭据后重新复制。凭据只留本机，不写入工程或提示词。在线工具不可用时可用离线文件流程；离线不使用 revision、requestId 或运行中任务 ID。


## 外部模型、手持与结构

需要导入资源、骨架和自带动作、手持绑定、接触点、楼层或建筑模块时，按需读[共用参数](project-format.md#外部模型手持与楼层)；在线用 `director_skill({path:"references/project-format.md"})`。未知网格节点、接触点和模块端口使用对应对象查询，不凭空编造 ID。上述字段与离线工程相同；当前任务不涉及这些功能时无需读取。

## 通用物理

启用物理、受力事件、布娃娃与扩展人形动作时，按需查 [物理参数](physics.md)；在线使用 `director_skill({path:"references/physics.md"})`，离线使用相同工程字段。
