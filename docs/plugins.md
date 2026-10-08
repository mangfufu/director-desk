# 插件 SDK

插件是用户主动安装的受信任程序，可增加独立功能，不限于已有工具的批量操作。编辑器入口使用 JavaScript 模块；可选后台使用独立 Node 进程。软件不提供社区商城或内容订阅系统。

## 安装与目录

「扩展 → 插件 → 导入目录」选择含 plugin.json 的文件夹，或导入可分享的 .ddplugin。导入后用滑动开关启用。更新同 ID 的插件时会停用，重新启用加载新代码。示例见 [自由曲线实验室](../examples/plugins/curve-lab)：独立画布、程序化三维装置、时间动画、Node 计算及私有文件保存。

```json
{
  "format":"director-plugin", "apiVersion":2,
  "id":"my-extension", "name":"我的插件", "version":"1.0.0",
  "entry":"index.js", "permissions":["editor"],
  "commands":[{"id":"open","label":"打开面板"}]
}
```

entry 导出 activate(api)，可异步初始化，返回清理函数。以相对路径导入模块，浏览器依赖预先打包；图片、字体、WASM 等资源可随目录携带。后台可携带普通 node_modules 文件，发布前自行构建原生依赖以匹配 Electron/操作系统。不自动运行 npm 安装脚本。

.ddplugin 为上述清单加 files 对象：每个相对路径对应 {encoding:"utf8"|"base64",data:"..."}。不能使用绝对路径、符号链接或跳出包目录。

在源码目录运行 `node scripts/pack-plugin.mjs examples/plugins/curve-lab tmp/curve-lab.ddplugin` 即可打包示例。输出放在插件目录之外；已有同名文件不会覆盖。打包包含所选目录的全部普通文件（跳过 .git），分享前移除开发缓存、密钥与私人素材。

## 运行边界

- editor：代码在编辑器环境执行，能访问界面和编辑器，不是安全沙箱。安装前必须信任作者。
- native：配置 backend:"backend.cjs" 或 .mjs，在独立进程执行。具有当前用户的文件、网络和进程权限，不受浏览器隔离限制。
- network：编辑器端可用 api.net.fetch(url,options)，经主进程访问 HTTP/HTTPS。返回 status、headers、body（字节数组）。

能力声明用于说明插件的访问范围，不承诺阻止恶意的受信任代码。第三方插件造成的浏览器死循环仍可能卡住编辑器；后台崩溃会拒绝请求，不退出主程序。

## 编辑器 SDK

```js
export function activate(api) {
  api.commands.register('open', () => {
    api.ui.panel({ title:'我的面板', mount(root) {
      const canvas=document.createElement('canvas');
      root.append(canvas); // ShadowRoot 内自行设计任意界面
      return () => { /* 清理自行注册的资源 */ };
    }});
  });
}
```

| 接口 | 用途 |
|---|---|
| api.THREE | 与宿主一致的 Three.js 实例 |
| commands.register(id,handler) | 注册清单声明的命令，handler 接收任意 JSON 参数；UI、内置 AI、MCP 共用 |
| tools.call(name,args) | 调用全部已有导演台工具，保持原校验、revision 和撤销 |
| project.get()/set(value) | 读取/原子保存本插件的戏段 JSON 数据，可撤销 |
| project.read() | 当前工程数据副本 |
| editor.transaction(fn) | 同步编辑当前工程；沿用普通编辑事务，失败回退；不要在其中发异步请求 |
| editor.selection()/time()/seek(t) | 读取当前选择和时间，跳帧 |
| editor.invalidate() | 刷新预览 |
| ui.panel({title,mount}) | 自定义可拖动、缩放浮窗；返回 show/hide/dispose；界面由插件自由绘制 |
| ui.commandButton(id) | 在编辑工具栏放入插件命令入口 |
| events.on('project'|'selection',fn) | 工程/选择变化时收到通知，返回解除订阅函数 |
| render.attach(object) | 加入 Three.js 对象；停用时移除；材质/几何由插件清理 |
| render.onSample(fn) | 同步逐帧求值，参数 {time,project,exporting}；播放、跳帧、导出使用同一入口 |
| render.use((frame,next)=>...) | 接入/替换渲染链；frame 包含 renderer、scene、camera、view、depth、time、project、exporting，next 调用后续绘制 |
| services.provide(name,value)/get(pluginId,name) | 插件公开自己的接口、对象或函数，其他已启用插件可复用 |
| extensions.run(pluginId,command,input) | 调用其他已安装启用插件的命令 |
| assets.url(relative) | 相对于编辑器入口的已安装资源地址 |
| backend.call(method,input) | 调用自身后台导出的任意方法 |
| dispose(fn) | 登记清理任务，停用/更新/卸载时逆序执行 |
| experimental.context/engine | 完整的编辑器与引擎接口，用于稳定 SDK 尚未覆盖的方向；内部接口随软件版本变化 |

插件可以自行实现导入导出器、算法或完全不同的工作流；命令不限定输入字段和返回格式。清单可给命令提供 description 和 inputSchema，供 Agent 判断用法；插件负责校验自己的业务输入。给面板/命令注册事件时，记得返回或登记解除函数。

## Node 后台

```js
exports.activate = async api => ({
  async calculate(input) { return { result:input.value*2 }; },
  async inspect() { return api.callTool('director_read',{sections:[]}); },
  async dispose() { /* 关闭连接和自己创建的子进程 */ }
});
```

后台 api 提供 id、dataDirectory、callTool(name,args)、callEditor(method,args)。dataDirectory 为插件私有本机目录，卸载保留；不进入工程或发布包。callEditor 支持 tool:{name,args}、command:{command,input}。后台请求默认最多 120 秒；插件可自行启动长任务并返回任务 ID，后续查询。停用终止后台，插件应自行清理它创建的子进程。

## 工程与渲染

插件数据保存在每场戏的 extensions[插件ID]，不设业务结构，只要求可序列化 JSON；没有安装插件也完整保留。资源可用已安装资源或自行保存为 JSON/数据 URL，但要让接收者安装对应插件。更新数据格式时由插件迁移，SDK 不猜测其私有结构。

逐帧计算必须根据 time 求值，不能按“上帧累加”实现，否则随机跳帧与导出不同。自定义渲染链需处理 frame.view（stage/shot）、frame.depth，并管理自己的 GPU 资源及 renderer 状态。示例的几何直接加入宿主场景，因此普通和深度输出都会参与绘制；自定义 shader/后处理的深度适配由插件实现。

停用后保留工程数据，移除注册的面板、工具按钮、服务、渲染回调及场景对象。工程撤销只覆盖工具编辑和 SDK 事务，不撤销网络请求、文件写入或任意原生程序的副作用。

## AI 调用

director_plugins 的 list 返回插件与命令摘要，read(id) 按需返回完整清单和 inputSchema；已知命令及参数时直接 run(id,command,input,revision,requestId)。input 接受命令要求的 JSON 值，包括数组或 null；省略时为 {}。不将模型生成的代码直接当工具参数执行。插件开发示例可以由 AI 编写为文件，经用户安装启用后运行。
