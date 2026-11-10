import * as T from 'three';
import { mesh } from './geometry.ts';

type Ring = [y: number, width: number, depth: number, offset?: number];
/** Rounded anatomy, with a small shared geometry cache per character. */
export function humanSurfaces() {
    const geometries = new Map<string, T.BufferGeometry>();
    const surface = (parent: T.Object3D, material: T.Material, rings: Ring[], segments = 16, subdivisions = 3, roundness = 1) => {
        const key = JSON.stringify([rings, segments, subdivisions, roundness]); let geometry = geometries.get(key);
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
                    const sx = Math.sin(angle), sz = Math.cos(angle);
                    positions.push(w * Math.sign(sx) * Math.pow(Math.abs(sx), roundness), y, d * Math.sign(sz) * Math.pow(Math.abs(sz), roundness) + offset); uv.push(j / segments, row / count);
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
        surface,
        bodyLimb(parent:T.Object3D,material:T.Material,kind:'arm'|'forearm'|'thigh'|'calf',length:number,upper:number,lower:number,depth=1){
            const leg=kind==='thigh'||kind==='calf',calf=kind==='calf';
            const bulge=calf?.33:kind==='forearm'?.25:kind==='thigh'?.25:.32;
            const offset=calf?-upper*.18:kind==='arm'?upper*.10:0;
            const object=surface(parent,material,[
                [-length-lower*.65,0,0],[-length-lower*.24,lower*.80,lower*.84*depth],
                [-length,lower,lower*depth],[-length*.78,lower+(upper-lower)*.34,(lower+(upper-lower)*.42)*depth],
                [-length*.53,upper*.88,upper*.93*depth,offset],[-length*bulge,upper,upper*depth,offset],
                [-length*.10,upper*(calf?.70:1),upper*(calf?.75:.94)*depth],
                [0,calf?lower*1.48:upper*(leg?.86:.92),(calf?lower*1.48:upper*.84)*depth],
                [upper*.35,(calf?lower:upper)*.55,(calf?lower:upper)*.55*depth],[upper*.55,0,0],
            ],12,2,1);
            object.geometry=object.geometry.clone().translate(0,length/2,0);object.position.y=-length/2;return object;
        },
        joint(parent: T.Object3D, material: T.Material, radius: number) { let geometry = geometries.get('joint');
            if (!geometry) { geometry = new T.SphereGeometry(1, 12, 8); geometries.set('joint', geometry); }
            const object = mesh(parent, geometry, material); object.scale.setScalar(radius); return object; },
        limb(parent: T.Object3D, material: T.Material, length: number, upper: number, lower: number, depth = 1) {
            const object = surface(parent, material, [
                [-length-lower*.75,0,0],[-length-lower*.3,lower*.78,lower*.78*depth],[-length,lower,lower*depth],
                [-length*.73,upper*.86,upper*.86*depth],[-length*.34,upper,upper*depth],[-length*.12,upper*.96,upper*.96*depth],
                [0,upper*.76,upper*.76*depth],[upper*.42,0,0],
            ], 12, 2, .86); object.geometry=object.geometry.clone().translate(0,length/2,0); object.position.y=-length/2; return object;
        },
        pelvis(parent: T.Object3D, material: T.Material, width: number, depth: number) { return surface(parent,material,[
            [-.115,0,0],[-.085,width*.65,depth*.7,-.008],[-.035,width*.94,depth,-.012],
            [.035,width,depth,-.01],[.105,width*.86,depth*.87],[.15,width*.76,depth*.75],[.17,0,0],
        ],16,2,1); },
        torso(parent: T.Object3D, material: T.Material, height: number, width: number, waist: number, depth: number) { return surface(parent, material, [
            [-.045,0,0],[-.025,waist*1.05,depth*.86],[height*.12,waist*1.05,depth*.94],
            [height*.29,waist,depth*.89],[height*.53,width*.96,depth*1.04,.009],[height*.69,width,depth,.009],
            [height*.84,width*.98,depth*.85],[height*.94,width*.72,depth*.66],
            [height+.01,.044,.045],[height+.03,0,0],
        ],16,2,1); },
        head(parent: T.Object3D, material: T.Material, size: number) { return surface(parent, material, [
            [0,0,0],[size*.12,size*.34,size*.43,size*.10],[size*.34,size*.51,size*.61,size*.06],
            [size*.65,size*.64,size*.70],[size*.95,size*.67,size*.72],[size*1.27,size*.69,size*.76,-size*.045],
            [size*1.59,size*.61,size*.69,-size*.07],[size*1.85,size*.39,size*.48,-size*.04],[size*2,0,0],
        ],16,2,1); },
        hand(parent: T.Object3D, material: T.Material, length: number) { return surface(parent, material, [
            [-length-.145,0,0],[-length-.133,.025,.014,.008],[-length-.083,.038,.022,.006],
            [-length-.039,.034,.022,.004],[-length,.025,.024],[-length+.02,0,0],
        ], 12, 2,.72); },
        skirt(parent: T.Object3D, material: T.Material, length: number, girth: number) { return surface(parent, material, [
            [-length,.155*girth,.16*girth],[-length*.94,.154*girth,.159*girth],
            [-length*.45,.127*girth,.14*girth],[0,.102*girth,.12*girth],
        ],16,2,.72); },
        foot(parent: T.Object3D, material: T.Material, z = .045) {
            // Elliptical shoe volume with a flat sole and a tapered toe. Same ankle/floor reference.
            const object = surface(parent,material,[[-.12,0,0],[-.104,.039,.031],[-.07,.049,.037],
                [.065,.049,.037],[.11,.044,.030],[.137,.025,.018],[.145,0,0]],12,2,.68);
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
