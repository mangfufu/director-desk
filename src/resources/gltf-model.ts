import * as T from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { adoptModel, disposeSource, type LoadedModel, type ModelSource } from './model-runtime.ts';
import { modelPath, readGltfDocument, unpackModelFiles, inlineModelBytes, resolveModelUri, type ModelPackage } from './model-package.ts';
import { shareModelImages } from './model-image-pool.ts';

const prefix = 'model-package:///';
const requiredExtensions = new Set(['KHR_lights_punctual', 'KHR_materials_clearcoat', 'KHR_materials_dispersion', 'KHR_materials_ior', 'KHR_materials_sheen',
    'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_materials_unlit', 'KHR_materials_volume',
    'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_emissive_strength', 'EXT_materials_bump', 'EXT_mesh_gpu_instancing', 'EXT_texture_webp', 'EXT_texture_avif']);

/** Each instance owns its skeleton/materials; geometry/textures belong to the loaded source. */
export async function loadGltfModel(resource: ModelPackage, signal?: AbortSignal): Promise<LoadedModel> {
    signal?.throwIfAborted();
    const files = unpackModelFiles(resource), bytes = files.get(modelPath(resource.entry))!;
    const { document } = readGltfDocument(bytes, resource.entry);
    const unsupported = (document.extensionsRequired ?? []).filter(name => !requiredExtensions.has(name));
    if (unsupported.length) throw Error('模型需要尚未接入的扩展：' + unsupported.join('、'));
    if (document.extensionsUsed?.includes('KHR_draco_mesh_compression')) throw Error('此模型使用 Draco 压缩；当前请导出未压缩 GLB/glTF');
    const manager = new T.LoadingManager(), urls = new Map<string, string>(), internalURLs = new Set<string>();
    let failedDependency = false;
    manager.onError = () => { failedDependency = true; };
    // Only data URIs declared in this model can bypass the local file map.
    const inline = new Set([...(document.buffers ?? []), ...(document.images ?? [])].map(x => x.uri).filter((uri): uri is string => !!uri?.startsWith('data:')));
    manager.setURLModifier(url => {
        // GLTFLoader creates these only for validated binary image bufferViews.
        // Source image/buffer URIs cannot specify blob: (packModelFiles rejects them).
        if (url.startsWith('blob:')) internalURLs.add(url);
        signal?.throwIfAborted();
        if (internalURLs.has(url)) return url;
        if (inline.has(url)) return url;
        if (!url.startsWith(prefix)) throw Error('模型尝试读取未打包的资源');
        let name: string; try { name = modelPath(decodeURIComponent(url.slice(prefix.length))); } catch { throw Error('模型资源引用无效'); }
        const file = files.get(name); if (!file) throw Error('模型资源缺失：' + name);
        if (!urls.has(name)) urls.set(name, URL.createObjectURL(new Blob([new Uint8Array(file)])));
        return urls.get(name)!;
    });
    const loader = new GLTFLoader(manager);
    const parent = resource.entry.includes('/') ? resource.entry.slice(0, resource.entry.lastIndexOf('/') + 1) : '';
    let gltf: GLTF;
    try {
        const data = /\.glb$/i.test(resource.entry) ? new Uint8Array(bytes).buffer : new TextDecoder().decode(bytes);
        gltf = await loader.parseAsync(data, prefix + parent.split('/').map(encodeURIComponent).join('/'));
    } finally { urls.forEach(url => URL.revokeObjectURL(url)); internalURLs.forEach(url => URL.revokeObjectURL(url)); }
    if (signal?.aborted) { disposeSource(gltf); signal.throwIfAborted(); }
    if (failedDependency) { disposeSource(gltf); throw Error('模型关联资源无法解码，请检查贴图或缓冲区文件'); }
    // The same embedded texture often occurs in many separately editable objects.
    // Hash encoded bytes once per image, then share only the immutable Source.
    try {
        const json = gltf.parser.json, textures = new Set<T.Texture>();
        for (const scene of gltf.scenes) scene.traverse(node => {
            if (!(node instanceof T.Mesh)) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material])
                for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
        });
        const hashes = new Map<number, Promise<string | undefined>>();
        const fileBytes = (uri: string) => uri.startsWith('data:') ? inlineModelBytes(uri) : files.get(resolveModelUri(resource.entry, uri));
        const imageHash = async (index: number): Promise<string | undefined> => {
            const img = json.images?.[index]; if (!img) return;
            let encoded: Uint8Array | undefined;
            if (img.uri) encoded = fileBytes(img.uri);
            else if (img.bufferView !== undefined) {
                const view = json.bufferViews?.[img.bufferView], buffer = json.buffers?.[view?.buffer];
                if (view && buffer) {
                    let data: Uint8Array | undefined;
                    if (buffer.uri) data = fileBytes(buffer.uri);
                    else if (/\.glb$/i.test(resource.entry)) {
                        const offset = 20 + new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true) + 8;
                        data = bytes.subarray(offset);
                    }
                    if (data) encoded = data.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
                }
            }
            if (!encoded) return;
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(encoded)));
            return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
        };
        const entries: { texture: T.Texture; key: string }[] = [];
        const sourceIndices = new Map<T.Texture['source'], number>();
        // GLTFLoader clones textures for texCoord > 0 without copying their
        // associations. The clone still points to the original immutable Source.
        for (const [object, association] of gltf.parser.associations) {
            if (object instanceof T.Texture && association?.textures !== undefined) sourceIndices.set(object.source, association.textures);
        }
        for (const texture of textures) {
            const index = gltf.parser.associations.get(texture)?.textures ?? sourceIndices.get(texture.source);
            const def = index === undefined ? undefined : json.textures?.[index];
            const imageIndex = def?.extensions?.EXT_texture_webp?.source ?? def?.extensions?.EXT_texture_avif?.source ?? def?.source;
            if (imageIndex === undefined) continue;
            if (!hashes.has(imageIndex)) hashes.set(imageIndex, imageHash(imageIndex));
            const key = await hashes.get(imageIndex); if (key) entries.push({ texture, key });
        }
        signal?.throwIfAborted();
        const lease = shareModelImages(entries);
        (gltf as ModelSource).sharedImages = lease.images; (gltf as ModelSource).releaseImages = lease.release;
    } catch (error) { disposeSource(gltf); throw error; }
    // Parsing caches retain encoded buffers and intermediate texture clones.
    // Runtime ownership needs only the completed scenes, clips and image leases.
    const { scene, scenes, cameras, animations, sharedImages, releaseImages } = gltf as ModelSource;
    return adoptModel({scene,scenes,cameras,animations,sharedImages,releaseImages}, document.asset.copyright ?? '', ['glTF 按米制、Y 轴向上读取；朝向和尺寸可在导入时校正。']);
}
