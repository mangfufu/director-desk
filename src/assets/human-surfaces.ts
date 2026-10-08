import * as T from 'three';
import { mesh } from './geometry.ts';

type Ring = [y: number, width: number, depth: number, offset?: number];
/** Rounded anatomy, with a small shared geometry cache per character. */
export function humanSurfaces() {
    const geometries = new Map<string, T.BufferGeometry>();
    const surface = (parent: T.Object3D, material: T.Material, rings: Ring[], segments = 16, subdivisions = 3) => {
        const key = JSON.stringify([rings, segments, subdivisions]); let geometry = geometries.get(key);
        if (!geometry) {
            const positions: number[] = [], uv: number[] = [], indices: number[] = [];
            const slope = (a: number, b: number) => a * b > 0 ? 2 * a * b / (a + b) : 0;
            const sample = (index: number, axis: number, t: number) => {
                const a = rings[index], b = rings[index + 1], p = rings[Math.max(0, index - 1)], n = rings[Math.min(rings.length - 1, index + 2)];
                const av = a[axis] ?? 0, bv = b[axis] ?? 0, span = b[0] - a[0], d = (bv - av) / span;
                const before = index ? (av - (p[axis] ?? 0)) / (a[0] - p[0]) : d;
                const after = index + 2 < rings.length ? ((n[axis] ?? 0) - bv) / (n[0] - b[0]) : d;
                return (2*t*t*t-3*t*t+1)*av+(t*t*t-2*t*t+t)*span*slope(before,d)+(-2*t*t*t+3*t*t)*bv+(t*t*t-t*t)*span*slope(d,after);
            };
            const count = (rings.length - 1) * subdivisions;
            for (let row = 0; row <= count; row++) {
                const index = Math.min(rings.length - 2, Math.floor(row / subdivisions)), t = row / subdivisions - index;
                const y = T.MathUtils.lerp(rings[index][0], rings[index + 1][0], t);
                const w = sample(index, 1, t), d = sample(index, 2, t), offset = sample(index, 3, t);
                for (let j = 0; j <= segments; j++) {
                    const angle = j / segments * Math.PI * 2;
                    positions.push(w * Math.sin(angle), y, d * Math.cos(angle) + offset); uv.push(j / segments, row / count);
                    if (row && j) { const a = (row-1)*(segments+1)+j-1, b = a+segments+1; indices.push(a,a+1,b,a+1,b+1,b); }
                }
            }
            geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
            // Weld the shading seam without altering UVs or adding draw calls.
            const normal = geometry.getAttribute('normal');
            for (let row = 0; row <= count; row++) { const a = row*(segments+1), b = a+segments;
                const n = new T.Vector3().fromBufferAttribute(normal,a).add(new T.Vector3().fromBufferAttribute(normal,b)).normalize(); normal.setXYZ(a,n.x,n.y,n.z); normal.setXYZ(b,n.x,n.y,n.z); }
            geometries.set(key, geometry);
        }
        return mesh(parent, geometry, material);
    };
    return {
        joint(parent: T.Object3D, material: T.Material, radius: number) { let geometry = geometries.get('joint');
            if (!geometry) { geometry = new T.SphereGeometry(1, 12, 8); geometries.set('joint', geometry); }
            const object = mesh(parent, geometry, material); object.scale.setScalar(radius); return object; },
        limb(parent: T.Object3D, material: T.Material, length: number, upper: number, lower: number, depth = 1) {
            const object = surface(parent, material, [
                [-length-.01,0,0],[-length,lower*.9,lower*.9*depth],[-length*.8,lower*1.15,lower*1.15*depth],
                [-length*.48,upper*.87,upper*.87*depth],[-length*.19,upper,upper*depth],[0,upper*.80,upper*.80*depth],[.015,0,0],
            ], 12, 2); object.geometry=object.geometry.clone().translate(0,length/2,0); object.position.y=-length/2; return object;
        },
        pelvis(parent: T.Object3D, material: T.Material, width: number, depth: number) { return surface(parent,material,[
            [-.12,0,0],[-.095,width*.58,depth*.68],[-.045,width*.96,depth],[.025,width,depth*.97],
            [.075,width*.83,depth*.83],[.12,width*.74,depth*.76],[.135,0,0],
        ]); },
        torso(parent: T.Object3D, material: T.Material, height: number, width: number, waist: number, depth: number) { return surface(parent, material, [
            [-.03,0,0],[-.015,waist,depth*.87],[height*.15,waist*.93,depth*.83],
            [height*.36,width*.90,depth],[height*.61,width,depth*1.04,.006],
            [height*.78,width*.98,depth*.93],[height*.90,width*.69,depth*.76],
            [height+.018,.043,.046],[height+.04,0,0],
        ]); },
        head(parent: T.Object3D, material: T.Material, size: number) { return surface(parent, material, [
            [0,0,0],[size*.10,size*.36,size*.43,size*.08],[size*.32,size*.56,size*.57,size*.05],
            [size*.72,size*.64,size*.66],[size*1.15,size*.67,size*.69,-size*.025],
            [size*1.60,size*.59,size*.63,-size*.025],[size*1.88,size*.36,size*.40],[size*2,0,0],
        ]); },
        hand(parent: T.Object3D, material: T.Material, length: number) { return surface(parent, material, [
            [-length-.099,0,0],[-length-.088,.023,.016,.014],[-length-.054,.036,.021,.012],
            [-length-.018,.031,.019,.01],[-length+.006,.025,.023,.005],[-length+.02,0,0],
        ], 12, 2); },
        foot(parent: T.Object3D, material: T.Material, z = .045) {
            // Elliptical shoe volume with a flat sole and a tapered toe. Same ankle/floor reference.
            const object = surface(parent,material,[[-.11,0,0],[-.094,.037,.034],[-.060,.0475,.037],
                [.025,.0475,.037],[.075,.042,.030],[.102,.022,.018],[.11,0,0]],12,2);
            object.geometry = object.geometry.clone(); object.geometry.rotateX(Math.PI/2); object.position.z=z;
            return object;
        },
    };
}

/** Keep local transforms compatible with previously captured continuation poses. */
export function rebaseHumanSurface(object: T.Mesh, position: T.Vector3, scale: T.Vector3) {
    object.updateMatrix(); const basis = new T.Matrix4().compose(position, object.quaternion, scale);
    object.geometry = object.geometry.clone().applyMatrix4(basis.clone().invert().multiply(object.matrix)); object.position.copy(position); object.scale.copy(scale); object.updateMatrix();
}
/** Retain historical child paths used by saved continuation poses. */
export function humanSurfaceSlot(parent: T.Object3D, position: T.Vector3, scale: T.Vector3) { const slot = new T.Group(); slot.position.copy(position); slot.scale.copy(scale); parent.add(slot); }
