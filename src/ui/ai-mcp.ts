import type { DesktopResult } from '../automation/desktop-types.ts';

/** Client configuration only; every transport uses the same running MCP service. */
export function mountAIMcp(panel: HTMLElement, status: (message: string) => void) {
    const bridge = window.directorDesktop;
    const enabled = panel.querySelector<HTMLInputElement>('#ai-mcp-enabled')!;
    const lanEnabled = panel.querySelector<HTMLInputElement>('#ai-mcp-lan-enabled')!;
    const lanRow = panel.querySelector<HTMLElement>('#ai-mcp-lan-row')!;
    const lanStatus = panel.querySelector<HTMLElement>('#ai-mcp-lan-status')!;
    const copy = panel.querySelector<HTMLButtonElement>('#ai-mcp-copy')!;
    const lanCopy = panel.querySelector<HTMLButtonElement>('#ai-mcp-lan-copy')!;
    const reset = panel.querySelector<HTMLButtonElement>('#ai-mcp-reset')!;
    const client = panel.querySelector<HTMLSelectElement>('#ai-mcp-client')!;
    const help = panel.querySelector<HTMLElement>('#ai-mcp-client-help')!;
    const descriptions = {
        http: '粘贴到客户端的 MCP 配置',
        'claude-code': '配置文件：.mcp.json',
        'claude-desktop': '本机连接 · claude_desktop_config.json',
        stdio: '本机连接 · 粘贴到客户端的 MCP 配置',
    };
    type Client = keyof typeof descriptions;
    const refreshLanCopy = () => {
        const available = lanEnabled.checked && ['http', 'claude-code'].includes(client.value);
        lanCopy.hidden = !available;
        lanCopy.disabled = !available;
    };
    client.onchange = () => { help.textContent = descriptions[client.value as Client]; refreshLanCopy(); };
    client.onchange(new Event('change'));
    const check = <T>(result: DesktopResult<T>) => { if (!result.ok) throw Error(result.error || '操作失败'); return result.data!; };
    const safe = (task: () => Promise<unknown>) => { void task().catch(error => status(error.message)); };
    const refresh = (state: { enabled: boolean; url?: string; lanEnabled?: boolean; lanUrl?: string; error?: string }) => {
        enabled.checked = state.enabled;
        panel.querySelector('#ai-mcp-status')!.textContent = state.url || state.error || '关闭';
        lanEnabled.disabled = !state.enabled;
        lanEnabled.checked = Boolean(state.enabled && state.lanEnabled);
        if (lanRow) lanRow.hidden = !lanEnabled.checked;
        if (lanStatus) lanStatus.textContent = state.lanUrl || '关闭';
        refreshLanCopy();
        reset.disabled = copy.disabled = !state.enabled;
    };
    enabled.onchange = () => { if (bridge) safe(async () => {
        enabled.disabled = true;
        try { refresh(check(await bridge.mcp(enabled.checked))); }
        catch (error) { refresh(check(await bridge.mcp())); throw error; }
        finally { enabled.disabled = false; }
    }); };
    lanEnabled.onchange = () => { if (bridge) safe(async () => {
        lanEnabled.disabled = true;
        try { refresh(check(await bridge.mcpLan(lanEnabled.checked))); }
        catch (error) { refresh(check(await bridge.mcp())); throw error; }
        finally { lanEnabled.disabled = !enabled.checked; }
    }); };
    reset.onclick = () => {
        if (bridge && confirm('重置后，旧配置将无法发起新调用，需要向客户端重新复制配置。正在执行的调用不会撤销。确定重置？')) safe(async () => {
            reset.disabled = true;
            try { refresh(check(await bridge.resetMcp())); status('访问令牌已重置，地址保持不变。请重新复制连接配置。'); }
            finally { refresh(check(await bridge.mcp())); }
        });
    };
    copy.onclick = () => { if (bridge) safe(async () => {
        check(await bridge.copyMcp(client.value as Client, false));
        status('本机连接配置已复制，包含访问凭据，请只交给要连接的客户端。');
    }); };
    if (lanCopy) {
        lanCopy.onclick = () => { if (bridge) safe(async () => {
            check(await bridge.copyMcp(client.value as Client, true));
            status('局域网连接配置已复制（含局域网 IP），同 WiFi 下的 Agent 可直接填入使用。');
        }); };
    }
    return refresh;
}
