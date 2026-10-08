import * as T from 'three';
import type { Rig } from '../assets/human-legacy.ts';
import type { Joint } from '../model.ts';
export const humanJointNode = (rig: Rig, joint: Joint) => joint === 'hips' ? rig.hips : joint === 'headYaw' ? rig.head : rig.joints[joint];
/** One selected rig, shared geometry, editor layer only. Saved models are untouched. */
export class JointNodes {
    readonly root = new T.Group();
    private geometry = new T.SphereGeometry(1, 10, 8);
    private normal = new T.MeshBasicMaterial({ color: '#b8b8b8', depthTest: false });
    private active = new T.MeshBasicMaterial({ color: '#ffffff', depthTest: false });
    private lineMaterial = new T.LineBasicMaterial({ color: '#999999', depthTest: false, transparent: true, opacity: .65 });
    private rig?: Rig;
    private nodes: { joint: Joint; bone: T.Object3D; marker: T.Mesh }[] = [];
    private lines?: T.LineSegments;
    private selected: Joint | '' = '';
    constructor() { this.root.layers.set(1); this.root.name = 'joint-editor'; }
    bind(rig?: Rig) {
        if (rig === this.rig) return;
        this.lines?.geometry.dispose(); this.root.clear(); this.nodes = []; this.lines = undefined; this.rig = rig;
        if (!rig) return;
        for (const [joint, bone] of Object.entries({ hips: rig.hips, ...rig.joints })) {
            const marker = new T.Mesh(this.geometry, this.normal); marker.layers.set(1); marker.renderOrder = 8;
            marker.userData.joint = joint; this.root.add(marker); this.nodes.push({ joint: joint as Joint, bone, marker });
        }
        const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(this.nodes.length * 6), 3));
        this.lines = new T.LineSegments(geometry, this.lineMaterial); this.lines.layers.set(1); this.lines.renderOrder = 7; this.lines.frustumCulled = false; this.root.add(this.lines);
    }
    select(joint: Joint | '') { this.selected = joint; }
    update(camera: T.PerspectiveCamera, height: number) {
        if (!this.rig) return;
        this.rig.root.updateWorldMatrix(true, true); const vertices = this.lines!.geometry.getAttribute('position') as T.BufferAttribute;
        for (const [index, { joint, bone, marker }] of this.nodes.entries()) {
            bone.getWorldPosition(marker.position); marker.material = joint === this.selected ? this.active : this.normal;
            marker.scale.setScalar(Math.max(.015, camera.position.distanceTo(marker.position) * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * 10 / Math.max(1, height)));
            const parent = bone.parent === this.rig.root ? bone : bone.parent!, p = parent.getWorldPosition(new T.Vector3());
            vertices.setXYZ(index * 2, p.x, p.y, p.z); vertices.setXYZ(index * 2 + 1, marker.position.x, marker.position.y, marker.position.z);
        }
        vertices.needsUpdate = true; this.lines!.geometry.computeBoundingSphere();
    }
    pick(ray: T.Raycaster): Joint | undefined { return this.root.visible ? ray.intersectObjects(this.nodes.map(n => n.marker), false)[0]?.object.userData.joint : undefined; }
    dispose() { this.lines?.geometry.dispose(); this.geometry.dispose(); this.normal.dispose(); this.active.dispose(); this.lineMaterial.dispose(); this.root.removeFromParent(); }
}
