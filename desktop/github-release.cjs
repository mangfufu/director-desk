const { parseReleaseVersion } = require('./release-version.cjs');
const { updateTarget } = require('./update-platform.cjs');
const GITHUB_REPOSITORY = 'mangfufu/director-desk';
const GITHUB_RELEASE_PAGE = `https://github.com/${GITHUB_REPOSITORY}/releases/latest`;

/** Detect releases even when older uploads have no electron-updater metadata. */
async function githubRelease(fetcher = fetch, platform = process.platform, arch = process.arch) {
    const response = await fetcher(`https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`, {
        signal: AbortSignal.timeout(10000), redirect: 'error', headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw Error(`GitHub release HTTP ${response.status}`);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 2_000_000) throw Error('Release response too large'); chunks.push(Buffer.from(chunk)); }
    const release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const version = parseReleaseVersion(release.tag_name)?.version;
    if (!version || release.draft || release.prerelease) throw Error('Invalid stable release');
    const tag = encodeURIComponent(release.tag_name), page = `https://github.com/${GITHUB_REPOSITORY}/releases/tag/${tag}`;
    const names = new Set((release.assets || []).filter(asset => asset.state === 'uploaded').map(asset => asset.name));
    const target = updateTarget(platform, arch);
    const canDownload = target && names.has(target.metadata) && names.has(target.artifact(version));
    return { version, notes: typeof release.body === 'string' ? release.body : '', page,
        feed: canDownload ? { provider: 'generic', url: `https://github.com/${GITHUB_REPOSITORY}/releases/download/${tag}/` } : null };
}
module.exports = { githubRelease, GITHUB_RELEASE_PAGE };
