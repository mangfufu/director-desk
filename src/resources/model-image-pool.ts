import type { Texture } from 'three';

const pool = new Map<string, { source: Texture['source']; users: number }>();
function close(image: unknown) {
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}

/** Share immutable decoded glTF images/GPU uploads, never mutable texture settings.
 * Each loaded model holds one lease per image; undo-retained models keep theirs.
 */
export function shareModelImages(entries: { texture: Texture; key: string }[]) {
    const keys = new Set<string>(), images = new Set<unknown>(), replaced = new Set<unknown>();
    for (const { texture, key } of entries) {
        let item = pool.get(key);
        if (!item) { item = { source: texture.source, users: 0 }; pool.set(key, item); }
        if (!keys.has(key)) { item.users++; keys.add(key); }
        if (texture.source.data !== item.source.data) replaced.add(texture.source.data);
        texture.source = item.source; images.add(item.source.data);
    }
    for (const image of replaced) if (!images.has(image)) close(image);
    let released = false;
    return { images, release() {
        if (released) return; released = true;
        for (const key of keys) {
            const item = pool.get(key)!;
            if (--item.users === 0) { close(item.source.data); pool.delete(key); }
        }
    } };
}
