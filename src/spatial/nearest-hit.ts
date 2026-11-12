import * as T from 'three';

/** Exact picking: reject static meshes by local bounds, then visit front to back.
 * Deformed, instanced and custom objects retain their own raycast implementation.
 * Bounds are transformed with the current matrix, so movement needs no rebuild.
 */
export function nearestVisibleHit(ray: T.Raycaster, roots: Iterable<T.Object3D>): T.Intersection | undefined {
    const candidates: { object: T.Object3D; distance: number }[] = [];
    const inverse = new T.Matrix4(), local = new T.Ray(), point = new T.Vector3();
    for (const root of roots) {
        let visible = true;
        for (let parent: T.Object3D | null = root; parent; parent = parent.parent) if (!parent.visible) { visible = false; break; }
        if (!visible) continue;
        root.traverseVisible(object => {
            if (!object.layers.test(ray.layers) || object.raycast === T.Object3D.prototype.raycast) return;
            let distance = 0;
            if (object instanceof T.Mesh && !(object instanceof T.SkinnedMesh) && !(object instanceof T.InstancedMesh)
                && !object.geometry.morphAttributes.position?.length && object.raycast === T.Mesh.prototype.raycast) {
                const geometry = object.geometry;
                if (!geometry.boundingBox) geometry.computeBoundingBox();
                const bounds = geometry.boundingBox;
                if (bounds) {
                    local.copy(ray.ray).applyMatrix4(inverse.copy(object.matrixWorld).invert());
                    if (!bounds.containsPoint(local.origin)) {
                        if (!local.intersectBox(bounds, point)) return;
                        distance = point.applyMatrix4(object.matrixWorld).distanceTo(ray.ray.origin);
                        if (distance > ray.far) return;
                    }
                }
            }
            candidates.push({ object, distance });
        });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const hits: T.Intersection[] = [];
    const far = ray.far;
    let nearest: T.Intersection | undefined;
    try {
        for (const candidate of candidates) {
            if (candidate.distance > ray.far) break;
            hits.length = 0;
            candidate.object.raycast(ray, hits);
            for (const hit of hits) if (hit.distance >= ray.near && hit.distance <= ray.far && (!nearest || hit.distance < nearest.distance)) {
                nearest = hit; ray.far = hit.distance;
            }
        }
        return nearest;
    } finally { ray.far = far; }
}
