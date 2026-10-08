import * as T from 'three';
import type { Rig } from './human-legacy.ts';
const matrix = new T.Matrix4(), part = new T.Matrix4(), point = new T.Vector3();
const footSamples = new WeakMap<T.Object3D, T.Vector3[]>();
function footPoints(foot: T.Object3D) {
    let points = footSamples.get(foot); if (points) return points;
    const unique = new Map<string, T.Vector3>();
    foot.traverse(node => {
        if (!(node instanceof T.Mesh)) return;
        const positions = node.geometry.getAttribute('position'); if (!positions) return;
        const transform = new T.Matrix4();
        for (let child: T.Object3D | null = node; child && child !== foot; child = child.parent)
            transform.premultiply(new T.Matrix4().compose(child.position, child.quaternion, child.scale));
        for (let i = 0; i < positions.count; i++) {
            const value = new T.Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform);
            unique.set(value.toArray().map(v => v.toFixed(6)).join(','), value);
        }
    });
    points = [...unique.values()]; footSamples.set(foot, points); return points;
}
/** Cheap mannequin support in actor-local space; paths/scene surface correction are separate. */
export function supportHumanFeet(r: Rig, only?: 'left' | 'right', settle = false) {
    let low = Infinity;
    for (const side of only ? [only] : ['left', 'right']) {
        const foot = r.joints[side + 'Ankle']; if (!foot) continue;
        matrix.identity();
        for (let node: T.Object3D | null = foot; node && node !== r.root; node = node.parent) {
            part.compose(node.position, node.quaternion, node.scale); matrix.premultiply(part);
        }
        for (const vertex of footPoints(foot)) low = Math.min(low, point.copy(vertex).applyMatrix4(matrix).y);
    }
    if (Number.isFinite(low)) r.hips.position.y -= only || settle ? low : Math.min(0, low);
}

const bodySamples = new WeakMap<Rig, { node: T.Mesh; points: T.Vector3[] }[]>();
/** Bounds are cached once; roll/fall contacts do not scan mesh vertices each frame. */
export function supportHumanBody(r: Rig) {
    let samples = bodySamples.get(r);
    if (!samples) {
        samples = []; r.root.traverse(node => { if (!(node instanceof T.Mesh)) return;
            node.geometry.computeBoundingBox(); const bounds = node.geometry.boundingBox!;
            const points: T.Vector3[] = [];
            for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(new T.Vector3(x, y, z));
            samples!.push({ node, points });
        }); bodySamples.set(r, samples);
    }
    r.root.updateWorldMatrix(true, true); const frame = r.root.matrixWorld.clone().invert(); let low = Infinity;
    for (const { node, points } of samples) { matrix.copy(frame).multiply(node.matrixWorld); for (const vertex of points) low = Math.min(low, point.copy(vertex).applyMatrix4(matrix).y); }
    if (Number.isFinite(low)) r.hips.position.y -= low;
}
