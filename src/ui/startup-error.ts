import { t } from '../i18n/locale.ts';
import './startup-error.css';

export function showStartupError(error: unknown) {
    console.error('DirectorDesk startup failed', error);
    const graphics = /webgl|opengl|graphics context/i.test(error instanceof Error ? error.message : String(error));
    const panel = document.createElement('main');
    panel.id = 'startup-error';
    panel.setAttribute('aria-labelledby', 'startup-error-title');
    const title = document.createElement('h1');
    title.id = 'startup-error-title';
    title.textContent = t(graphics ? '无法启动三维画面' : '无法启动导演台');
    title.tabIndex = -1;
    const description = document.createElement('p');
    description.textContent = t(graphics
        ? '请检查显卡驱动和硬件加速设置，然后重试。'
        : '请重新打开软件，或安装最新版本后重试。');
    const actions = document.createElement('div');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = t('重试');
    retry.addEventListener('click', () => location.reload());
    actions.append(retry);
    const desktop = window.directorDesktop;
    if (desktop?.windowControl) {
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = t('退出');
        close.addEventListener('click', () => { void desktop.windowControl!('close'); });
        actions.append(close);
    }
    panel.append(title, description, actions);
    // Remove the incomplete editor instead of leaving nonfunctional controls visible.
    document.body.replaceChildren(panel);
    title.focus();
}
