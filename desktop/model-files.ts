import fs from 'node:fs/promises';
import path from 'node:path';
import { packModelFiles, readGltfDocument, resolveModelUri } from '../src/resources/model-package.ts';
import { objLibraries, objReferences, objFilePath, readObjMaterials } from '../src/resources/obj-source.ts';
import { inspectFbxSource, resolveFbxFile } from '../src/resources/fbx-source.ts';

/** Read only referenced sidecars inside the selected model folder; never scan Downloads recursively. */
export async function readModelFiles(filename: string, dependencies: string[] = []) {
    const root = await fs.realpath(path.dirname(filename)), entry = path.basename(filename);
    const files = new Map<string, Uint8Array>(), available = new Map<string, Uint8Array>();
    const within = (name: string) => {
        const relative = path.relative(root, name);
        if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error('关联资源必须位于模型所在目录内');
        return relative.replace(/\\/g, '/');
    };
    for (const name of await fs.readdir(root)) available.set(name, new Uint8Array());
    for (const name of dependencies) available.set(within(path.resolve(root, name)), new Uint8Array());
    let total = 0;
    const read = async (name: string) => {
        if (files.has(name)) return files.get(name)!;
        const physical = await fs.realpath(path.resolve(root, name)); within(physical);
        const info = await fs.stat(physical);
        if (!info.isFile() || (total += info.size) > 512 * 1024 * 1024) throw Error('模型资源不是文件或总大小超过 512 MB');
        const bytes = new Uint8Array(await fs.readFile(physical)); files.set(name, bytes); available.set(name, bytes); return bytes;
    };
    const bytes = await read(entry);
    if (/\.(glb|gltf)$/i.test(entry)) {
        const { document } = readGltfDocument(bytes, entry);
        for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
            if (typeof item.uri === 'string' && !item.uri.startsWith('data:')) await read(resolveModelUri(entry, item.uri));
        }
    } else if (/\.obj$/i.test(entry)) {
        const references = objReferences(bytes);
        // Preserve the shared parser's handling of unquoted MTL names containing spaces.
        for (const line of references) if (line.key === 'mtllib' && !/["']/.test(line.value)) {
            const name = objFilePath(entry, line.value);
            if (await fs.stat(path.resolve(root, name)).then(s => s.isFile(), () => false)) available.set(name, new Uint8Array());
        }
        for (const library of objLibraries(entry, bytes, available, references)) {
            for (const material of readObjMaterials(library, await read(library)))
                for (const property of material.properties) if (property.texture) await read(property.texture.path);
        }
    } else if (/\.fbx$/i.test(entry)) {
        for (const media of inspectFbxSource(bytes).media) if (!media.embedded) {
            const normalized = media.reference.replace(/\\/g, '/');
            if (!path.isAbsolute(normalized) && !/^[a-z]:/i.test(normalized)) {
                const name = within(path.resolve(root, normalized));
                if (await fs.stat(path.join(root, name)).then(s => s.isFile(), () => false)) available.set(name, new Uint8Array());
            }
            await read(resolveFbxFile(entry, media.reference, available));
        }
    } else throw Error('模型文件支持 GLB、glTF、FBX、OBJ');
    return packModelFiles(entry, [...files].map(([path, bytes]) => ({ path, bytes })));
}
