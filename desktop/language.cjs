const { ipcMain } = require('electron');
const languageKey = Symbol.for('director.ui.language');
const english = {
    '导演台': 'DirectorDesk', '开发测试版': 'Development Build',
    '默认工程目录': 'Default Project Folder', '默认导出目录': 'Default Export Folder',
    '保存项目': 'Save Project', '导演台工程': 'DirectorDesk Project', '保存位置': 'Save Location',
    '保存导演台文件': 'Save DirectorDesk File', '退出导演台': 'Quit DirectorDesk',
    '请先完成或取消当前操作': 'Finish or cancel the current operation first.', '返回编辑': 'Back to Editor',
    '是否保存当前工程后退出？': 'Save the current project before quitting?',
    '保存并退出': 'Save and Quit', '不保存退出': 'Quit Without Saving', '取消': 'Cancel',
    '重启安装更新': 'Restart to Update', '现在关闭导演台并安装新版本？': 'Close DirectorDesk and install the update now?',
    '当前工程的自动恢复副本已保存。对话和渠道配置保留在本机。': 'A recovery copy of your project has been saved. Conversations and provider settings will be kept.',
    '稍后': 'Later', '重启安装': 'Restart and Install', '导入插件': 'Import Plugin', '导演台插件': 'DirectorDesk Plugin',
    '选择包含 SKILL.md 的技能目录': 'Choose a Skill Folder Containing SKILL.md', '选择技能说明': 'Choose Skill Instructions',
};
function attachLanguage(window) {
    const receive = (event, language) => {
        if (event.sender === window.webContents && event.senderFrame?.url === 'director://app/' && ['en', 'zh-CN'].includes(language)) window[languageKey] = language;
    };
    ipcMain.on('director-language', receive);
    window.once('closed', () => ipcMain.removeListener('director-language', receive));
}
const text = (window, source) => window[languageKey] === 'en' ? english[source] ?? source : source;
module.exports = { attachLanguage, text };
