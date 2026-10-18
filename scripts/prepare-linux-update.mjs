import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import yaml from 'js-yaml';
import { releaseVersion } from '../desktop/release-version.cjs';
import { updateTarget } from '../desktop/update-platform.cjs';

// Stage a verified feed; publishing to the website or GitHub is a separate action.
const release = path.resolve(process.argv[2] || 'release');
const destination = path.resolve(process.argv[3] || 'output/linux-update');
if (release === destination) throw Error('Use a separate output directory');
const target = updateTarget('linux', 'x64');
const metadata = await fs.readFile(path.join(release, target.metadata), 'utf8');
const info = yaml.load(metadata), version = releaseVersion(info.version);
if (version !== releaseVersion(JSON.parse(await fs.readFile('package.json', 'utf8')).version)) throw Error('Update version does not match package.json');
const appImage = target.artifact(version);
const files = [appImage, `DirectorDesk-${version}-linux-x64.tar.gz`];
const hash = async (file, algorithm, encoding = 'hex') => {
    const digest = createHash(algorithm);
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest(encoding);
};
if (!Array.isArray(info.files) || !info.files.length || info.files.some(file => !files.includes(file.url)) || !info.files.some(file => file.url === appImage)) throw Error('Unexpected Linux update files');
for (const file of info.files) {
    const full = path.join(release, file.url), stat = await fs.lstat(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size || await hash(full, 'sha512', 'base64') !== file.sha512) throw Error('Linux update checksum or size mismatch');
}
await fs.mkdir(destination, { recursive: true });
const sums = [];
for (const file of files) {
    const from = path.join(release, file), to = path.join(destination, file), stat = await fs.lstat(from);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Expected a regular release artifact');
    const digest = await hash(from, 'sha256'); sums.push(`${digest}  ${file}`);
    try { if (await hash(to, 'sha256') !== digest) throw Error('Cannot replace a published artifact: ' + file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await fs.copyFile(from, to + '.tmp'); await fs.rename(to + '.tmp', to); }
}
await fs.writeFile(path.join(destination, `SHA256SUMS-${version}-linux-x64.txt`), sums.join('\n') + '\n');
await fs.writeFile(path.join(destination, target.metadata + '.tmp'), metadata);
await fs.rename(path.join(destination, target.metadata + '.tmp'), path.join(destination, target.metadata));
console.log(`Linux ${version}: AppImage, archive and checksums staged; metadata switched last.`);
