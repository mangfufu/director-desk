import fs from 'node:fs/promises';
import path from 'node:path';
import {readExtensionPackage} from '../desktop/extensions/store.cjs';
import {assertExtensionPackage} from '../src/plugins/extension-package.ts';

const [source,destination,...extra]=process.argv.slice(2);
if(!source||!destination||extra.length||path.extname(destination)!=='.ddplugin') {
    throw Error('用法：node scripts/pack-plugin.mjs 插件目录 输出.ddplugin');
}
const from=path.resolve(source),to=path.resolve(destination),relative=path.relative(from,to);
if(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw Error('输出文件请放在插件目录以外');
const pkg=await readExtensionPackage(from);assertExtensionPackage(pkg);
await fs.mkdir(path.dirname(to),{recursive:true});
await fs.writeFile(to,JSON.stringify(pkg),{flag:'wx'});
console.log(`已生成 ${path.basename(to)}（${Object.keys(pkg.files).length} 个文件）`);
