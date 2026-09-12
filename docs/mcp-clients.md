# MCP 客户端连接

## 外部 Agent 与 skill

1. 打开软件及要编辑的工程，在 AI 面板勾选「本机 MCP」。内置 AI 本身不要求开启 MCP。
2. 点击「复制连接配置」，把配置交给支持 Streamable HTTP 与请求头认证的 MCP 客户端。连接凭据只授权该客户端访问当前场景，与模型 API key 分开。
3. 连接后调用 `director_skill` 获取软件内置说明；当前对话已包含同版本说明时不重复读取。也可将随软件提供的 `director-desk` skill 放入客户端支持的 skills 目录，使用在线工具或离线工程脚本。

当前同时提供 Streamable HTTP 和内置 stdio 桥接，共用同一套查询、编辑、撤销与 skill 工具。MCP 服务绑定本机回环地址，首次连接的端口和加密凭据保存在本机，关闭再开启或重启软件会复用；手动重置凭据后才需更新客户端配置。端口占用或配置无法解密时会明确报错，不静默换地址。关闭软件后不能操作隐藏工程；重新连接先读取当前工程。页面重载后旧 revision 也会失效。

在「AI → MCP 连接」中选择客户端，再复制配置：

| 客户端 | 配置与连接方式 |
| --- | --- |
| 通用 HTTP | 原有 url + headers 格式，适合支持 Streamable HTTP 的本地 Agent |
| Claude Code（CLI / 桌面 Code） | 带 type: http 的配置，可合并到 .mcp.json；CLI 与桌面 Code 本地会话使用客户端的 MCP 配置 |
| Claude Desktop（聊天） | command / args / env 格式，合并到 claude_desktop_config.json 并重启客户端 |
| 通用 stdio | 与 Claude Desktop 相同的标准进程配置，适合其他支持 stdio 的本地 Agent |

stdio 使用软件自带运行时与桥接文件，无需另装 Node.js 或通过 npx 下载依赖。路径按当前安装位置生成；移动免安装目录后需要重新复制配置。访问令牌通过配置 env 传给桥接，不放在命令行参数里。保持导演台开启并启用 MCP，桥接不创建独立工程，也不自动重试写入。不要把配置中的凭据提交到公共仓库。

## 局域网 (同 WiFi) 外部 Agent 连接

如需在同一 WiFi / 局域网下的其他设备上运行 Agent 并连接当前电脑上的导演台：

1. 开启「启用本机 MCP」后，勾选「允许局域网连接 (同 WiFi)」。
2. 软件将自动启动内置局域网反向代理，并检测展示本机局域网地址（如 `http://192.168.x.x:端口/mcp`）。
3. 点击「复制局域网配置」，将生成的配置填入另一台电脑的 Agent 配置文件中（如 `.mcp.json` 或支持 Streamable HTTP 的 MCP 客户端配置）。
4. 局域网连接依然要求 Bearer Token 身份验证。关闭局域网连接或重置凭据后，局域网端口与旧 Token 会立即停止对外服务。

这里的本机是运行导演台的那台电脑。Claude 的云端远程连接器无法访问本机回环地址，不应把这些配置填到云端连接器中。参见 [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp) 和 [Claude 远程连接器说明](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)。已用 Claude Code 2.1.252 实机检查 HTTP 和 stdio 连接，并通过独立 MCP 客户端验证真实桌面工程的工具发现与读取；Claude Desktop 聊天端尚未完成客户端界面验收。
