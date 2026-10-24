const { createHash } = require('node:crypto');
const { parseReleaseVersion } = require('../release-version.cjs');
const { referenceFiles } = require('../../scripts/builtin-skill-files.cjs');

const digest = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contentVersion = data => digest([data.entry, ...referenceFiles.map(file => data.references[file]), data.contractVersion]);
function validateOfficialSkill(data) {
    if (!data || data.name !== 'director-desk' || !parseReleaseVersion(data.releaseVersion)
        || !/^sha256:[a-f0-9]{64}$/.test(data.contractVersion || '') || !data.references || Array.isArray(data.references)
        || Object.keys(data.references).length !== referenceFiles.length
        || referenceFiles.some(file => !Object.hasOwn(data.references, file))) throw Error('官方技能包格式无效');
    for (const value of [data.entry, data.instructions, ...Object.values(data.references)]) {
        if (typeof value !== 'string' || !value.trim() || value.length > 300000 || value.includes('\0')) throw Error('官方技能内容无效');
    }
    if (!/^name: director-desk\s*$/m.test(data.entry) || data.instructions !== data.references['references/online-workflow.md']
        || data.version !== contentVersion(data)) throw Error('官方技能校验失败');
    // Keep only published data. No downloaded code or arbitrary paths are loaded.
    return { name: data.name, releaseVersion: data.releaseVersion, contractVersion: data.contractVersion,
        version: data.version, entry: data.entry, instructions: data.instructions,
        references: Object.fromEntries(referenceFiles.map(file => [file, data.references[file]])) };
}
module.exports = { digest, contentVersion, validateOfficialSkill };
