# 通用物理与人形动作

物理是可选的预演能力，不限定武打。人物、道具和导入模型可做掉落、抛掷、滚动和碰撞。默认关闭，旧工程继续使用原路径与动作。

用户要求展示模板时，可用 `director_scene` 的 create、template:"physics-stage" 创建「动作与物理实验场」：20 秒，包含人物动作、惯性对比、掉落弹跳与布娃娃。普通编辑继续修改当前戏段，不为设置物理新建模板。离线 `create --template physics-stage` 使用同一场景。

通过现有 `director_apply` 的 `project` 和 `update` 操作编辑，使用原有 revision、事务和撤销。`physics` 对象完整替换；未知已有参数时先按 ID 读取 details。不要为了设置物理新建工程。

```json
[
  {"operation":"project","patch":{"physics":{"enabled":true,"gravity":[0,-9.81,0],"ground":true}}},
  {"operation":"update","id":"物体ID","patch":{"physics":{
    "enabled":true,"mode":"dynamic","gravity":true,"collisions":true,"inertia":true,"ragdoll":false,
    "shape":"auto","start":1,"mass":2,"friction":0.5,"restitution":0.15,"damping":0.05,
    "velocity":[0,0,0],"angularVelocity":[0,0,0],
    "impulses":[{"time":2,"impulse":[4,3,0],"point":[0,0.1,0]}]
  }}}
]
```

- 世界坐标米／秒，+Y 向上。重力 m/s²，初速度 m/s，角速度 rad/s，质量 kg；冲量 N·s，point 是从碰撞体质心起算的**世界方向偏移**，不是绝对位置。
- `mode`: dynamic 从 start 秒开始接管运动；此前按动作、路径运行。kinematic 按路径运动并推动动态物体；static 固定在开头位置作为障碍。start 在戏段时长内，受力时间不能早于 start，按时间升序排列。
- inertia 开启时继承释放时路径速度，保留运动惯性；关闭时每步抑制水平滑行及旋转，无重力时也抑制竖直漂移。单次冲量仍生效，持续运动通常开启 inertia。重力、碰撞、布娃娃各自有开关。
- mass 0.01..100000，friction 0..2，restitution 0..1，damping 0..1。velocity 各轴 ±1000，angularVelocity ±100。impulse 各轴 ±100000，point 各轴 ±1000；最多 256 个事件。
- shape: auto 为自动简化形状，等比例球体几何自动使用球形，其他动态模型使用包围盒（静态布景可用复合盒体）；box 为包围盒，sphere 为包围球。刚体围绕碰撞体中心旋转，模型编辑原点保持原格式。球体通过摩擦产生滚动，零摩擦允许滑动，不自动补旋转。未配置 physics 的普通可见道具作为静态障碍，有路径或动画时作为按路径运动的障碍；显式 enabled:false 将它排除。场景 ground 控制 Y=0 平面，房间结构仍参与碰撞。
- 布娃娃要求 dynamic 与人形骨架。内置人形直接支持；导入人物先配置 external.rig，复用同一骨架映射。动物、群演整体、摄影机、灯光、抽象元素不支持关节布娃娃；手持或结构绑定对象先解除绑定再启用物理。
- 人形动作：guard 防御、punch 出拳、kick 踢腿、roundhouse 回旋踢、flying-kick 飞身踢、dodge 闪避、throw 抛掷、push 推物、stumble 踉跄、roll 翻滚。23 个默认人形动作使用手工编排的关节关键姿态，包含支撑、蓄力、伸展、回收或落地；关键姿态的速度与加速度连续，衔接期间前后动作继续播放。用户仍可选择成品动作素材或导入动作。沿用 clips 格式；内置人形及已映射导入人形可用，位移仍由路径／物理控制。单次动作优先使用目录推荐时长，加长会放慢表演。动作不会自动检测拳脚命中，也不自动生成受力事件。
- 固定步长求值与有上限的帧缓存共用于预览、跳帧、空间查询及导出。保存参数与受力事件，不保存缓存。碰撞为简化近似，高速细物体可能穿透；不能当作精细人体仿真。布娃娃启用后接管身体，原动作不再驱动关节。
- 接拍保留实际输出末帧位置和姿态，新戏段物理停用以免重新掉落；源段不变。普通复制保留物理，编组旋转同步旋转世界速度与冲量。插入布景沿用目标场景重力设置，需要时显式启用场景物理。

离线工程使用相同字段；project-tool.mjs validate/apply 校验和写入参数，不离线模拟或保证画面效果。
