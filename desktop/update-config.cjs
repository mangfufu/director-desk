const fs = require('node:fs/promises');
const path = require('node:path');
const { updateTarget } = require('./update-platform.cjs');
const defaultUpdateUrl = (platform = process.platform, arch = process.arch) => `https://bigthat.me/updates/${updateTarget(platform, arch)?.directory || 'win-x64'}/`;
const UPDATE_URL = defaultUpdateUrl();
const { GITHUB_RELEASE_PAGE } = require('./github-release.cjs');
function validateConfig(input) {
    if (!input || typeof input.automatic !== 'boolean' || typeof input.url !== 'string') throw Error('更新设置无效');
    let url; try { url = new URL(input.url.trim()); } catch { throw Error('请填写 HTTPS 更新目录地址'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('更新地址必须为不含凭据或查询参数的 HTTPS 目录');
    const source = input.source ?? 'auto';
    if (!['auto', 'website', 'github'].includes(source)) throw Error('更新来源无效');
    return { url: url.href.replace(/\/?$/, '/'), automatic: input.automatic, source };
}
function createUpdateConfig(directory, platform = process.platform, arch = process.arch) {
    const defaultUrl = defaultUpdateUrl(platform, arch);
    const file = path.join(directory, 'updates.json'); let config = { url: defaultUrl, automatic: true, source: 'auto' };
    const ready = (async () => {
        try {
            config = validateConfig(JSON.parse(await fs.readFile(file, 'utf8')));
            // Old Linux builds stored the Windows default. Preserve custom servers.
            if (platform === 'linux' && config.url === defaultUpdateUrl('win32', 'x64')) config.url = defaultUrl;
        }
        catch (error) { if (error.code !== 'ENOENT') throw Error('无法读取本机更新设置，请重新保存'); }
    })(); ready.catch(() => {});
    return { ready, read: () => ({ ...config }), feed: () => ({ provider: 'generic', url: config.url }), page: () => config.source === 'github' ? GITHUB_RELEASE_PAGE : new URL('/', config.url).href,
        async save(input) {
            await ready.catch(() => {}); const next = validateConfig(input); await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 }); await fs.rename(file + '.tmp', file); config = next; return { ...config };
        } };
}
module.exports = { createUpdateConfig, validateConfig, UPDATE_URL };
