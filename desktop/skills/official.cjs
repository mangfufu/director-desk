const fs = require('node:fs/promises');
const path = require('node:path');
const { compareReleaseVersions } = require('../release-version.cjs');
const { validateOfficialSkill } = require('./official-package.cjs');

const OFFICIAL_SKILL_URL = 'https://raw.githubusercontent.com/mangfufu/director-desk/main/src/automation/builtin-skill.json';
const MAX_BYTES = 2 * 1024 * 1024;
function createOfficialSkill({ directory, builtin, fetcher = (...args) => fetch(...args), onChange = () => {} }) {
    const file = path.join(directory, 'skills', 'official.json');
    let active = builtin, candidate = null, checking = null, installing = null, status = 'unchecked', error;
    const newer = (a, b) => compareReleaseVersions(a.releaseVersion, b.releaseVersion) > 0;
    const compatible = data => data.contractVersion === builtin.contractVersion;
    const ready = fs.readFile(file, 'utf8').then(text => {
        if (Buffer.byteLength(text) > MAX_BYTES) throw Error('官方技能包过大');
        const saved = validateOfficialSkill(JSON.parse(text));
        if (compatible(saved) && newer(saved, builtin)) active = saved;
        else if (!compatible(saved) && newer(saved, builtin)) { status = 'incompatible'; candidate = saved; }
    }).catch(cause => {
        if (cause.code !== 'ENOENT') { status = 'error'; error = '已使用随软件提供的技能，本机更新副本无法读取'; }
    });
    const state = () => ({ status, currentVersion: active.releaseVersion, latestVersion: candidate?.releaseVersion, error });
    async function current() { await ready; return active; }
    async function check() {
        await ready;
        if (checking) return checking;
        if (installing) { await installing; return state(); }
        checking = (async () => {
            status = 'checking'; error = undefined; candidate = null;
            try {
                const response = await fetcher(OFFICIAL_SKILL_URL, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
                if (!response.ok) throw Error(`技能更新检查失败（${response.status}）`);
                if (Number(response.headers.get('content-length')) > MAX_BYTES) throw Error('官方技能包过大');
                const chunks = []; let length = 0;
                for await (const chunk of response.body) {
                    length += chunk.length; if (length > MAX_BYTES) throw Error('官方技能包过大');
                    chunks.push(Buffer.from(chunk));
                }
                const downloaded = validateOfficialSkill(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                if (!newer(downloaded, active)) {
                    if (compareReleaseVersions(downloaded.releaseVersion, active.releaseVersion) === 0 && downloaded.version !== active.version) throw Error('同一技能版本的内容不一致');
                    status = 'current';
                } else {
                    candidate = downloaded; status = compatible(downloaded) ? 'available' : 'incompatible';
                }
            } catch (cause) { status = 'error'; error = cause.name === 'TimeoutError' ? '技能更新检查超时，请重试' : cause.message; }
            return state();
        })();
        try { return await checking; } finally { checking = null; }
    }
    async function install() {
        await ready;
        if (installing) return installing;
        if (checking) await checking;
        if (installing) return installing;
        if (status !== 'available' || !candidate || !compatible(candidate) || !newer(candidate, active)) throw Error('没有可安装的技能更新');
        const next = candidate;
        installing = (async () => {
            const temporary = file + '.tmp';
            try {
                await fs.mkdir(path.dirname(file), { recursive: true });
                await fs.writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
                await fs.rename(temporary, file);
            } catch (cause) { await fs.rm(temporary, { force: true }).catch(() => {}); throw cause; }
            active = next; candidate = null; status = 'current'; error = undefined;
            onChange(active);
            return state();
        })();
        try { return await installing; } finally { installing = null; }
    }
    return { ready, current, state, check, install };
}
module.exports = { createOfficialSkill, OFFICIAL_SKILL_URL };
