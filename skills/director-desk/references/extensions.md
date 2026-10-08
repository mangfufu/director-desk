# 插件、工程版本与自动避障

## 插件

`director_plugins({action:"list"})` 只返回已安装插件与命令摘要，`read(id)` 按需返回完整清单和命令 inputSchema。`run(id,command,input,revision,requestId)` 调用插件注册的命令，input 按命令 schema 提供，可为对象、数组、字符串、数字、布尔值或 null；省略时为 {}。已知参数时可直接 run，无需重复 read。

桌面 `import(path)` 接受 `.ddplugin` 或含 `plugin.json` 的目录，导入后用 `enable(id,enabled:true)` 启用；`remove(id)` 卸载。管理操作需要 requestId，插件安装不属于工程撤销。只导入用户指定、可信的插件，不把模型回复作为即时执行代码，也不为普通布景擅自安装插件。

这是运行自定义代码的扩展机制：editor 插件可以创建自己的界面、三维对象、渲染流程与算法；native 后台可使用 Node 依赖、本机文件、网络和外部程序。权限声明说明能力范围，不是安全沙箱。

SDK 事务和工具编辑可撤销；后台文件、网络等外部操作不属于工程撤销。失败时检查实际结果，不重放已完成的外部操作。工程内 `extensions[插件ID]` 是插件自己的 JSON 数据，`director_read(sections:["scene"])` 可查询；不认识其结构时用插件命令修改。数据随保存、戏段和历史版本保留，停用或缺少插件也不删除。独立打开含插件数据的戏段可保留全部内容；通用场景合并不能推断插件私有 ID 或时间关系，请使用插件提供的合并命令。

## 工程历史版本

`director_versions`：list 列出当前工程版本；save(name) 保存整个工程；rename(id,name)、remove(id) 管理版本；restore(id) 恢复整个工程，可撤销；export(id,path?) 独立导出 `.director`，不改变当前工程。

除 list 外均需要当前 revision 和 requestId。projectId 将版本归属于工程，重新打开已保存工程后沿用。版本存放在本机应用数据中，模型、媒体按内容复用，不嵌入普通工程。另存同一工程仍共用版本记录，新建工程获得新标识。不为每次普通编辑自动另存版本。

## 自动避障

传给 `director_navigate`：

```json
{"entityIds":["crowd-1"],"destination":[8,0,0],"start":0,"end":20,"radius":0.35,"speed":1.5,"revision":123,"requestId":"route-1"}
```

destination 为队形中心终点，保持终点间距；radius 为单人避让半径，speed 为米/秒。默认用场景实际边界，也可指定 obstacleIds。返回 jobId，用 director_job 查询完成或取消。完成后替换所选对象原路线，结果包含每人出发、到达时间及 movingObstacleIds。封路、过密或时长不足会报错，不部分提交。

当前为同高度地面、静态障碍二维规划；其他移动对象按起点边界计算，不含楼梯、攀爬或动态寻路。包围盒较保守，拱门等凹模型可用分开障碍模型或显式 obstacleIds。群演间检查连续线段距离并错峰出发；没有安全时序时调整空间、时间或分组。

人物用普通 path；群演保留原对象，将成员局部路线存为 memberPaths，整体变换仍作用全组。人数变化前清除或重新生成 memberPaths；动作轨道与独立路线分别计时。预览、跳帧、导出共用求值。

离线导出 planNavigation(project,options)、memberSample、findGroundRoute、routesConflict。options 需提供世界坐标 bounds:{id:{min:[x,y,z],max:[x,y,z]}}，返回普通 operations，再用 applyOperations 校验。离线支持 memberPaths 与 projectId；本机版本库、插件运行需要软件。
