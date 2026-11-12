import * as T from 'three';

type ShadowLight = T.DirectionalLight | T.SpotLight | T.PointLight;

/** Keep one live key shadow while manipulating a costly scene. All lights still illuminate it. */
export function secondaryPreviewShadows(scene: T.Scene, camera: T.Camera): ShadowLight[] {
    const lights: ShadowLight[] = [];
    let casters = 0;
    scene.traverseVisible(object => {
        if (!object.layers.test(camera.layers)) return;
        if (object instanceof T.Mesh && object.castShadow) casters++;
        if ((object instanceof T.DirectionalLight || object instanceof T.SpotLight || object instanceof T.PointLight)
            && object.castShadow && object.intensity > 0 && object.shadow.intensity > 0) lights.push(object);
    });
    const passes = lights.reduce((sum, light) => sum + (light instanceof T.PointLight ? 6 : 1), 0);
    if (lights.length < 2 || casters * passes < 3000) return [];
    // Prefer a directional or spot key: a point light needs six shadow views.
    const rank = (light: ShadowLight) => light instanceof T.DirectionalLight ? 0 : light instanceof T.SpotLight ? 1 : 2;
    lights.sort((a, b) => rank(a) - rank(b) || b.intensity - a.intensity || a.id - b.id);
    return lights.slice(1);
}

/** Cache exact shadow inputs per WebGL context. Camera orbit is not a shadow change. */
export function shadowInputs(scene: T.Scene, camera: T.Camera, type: T.ShadowMapType): (number | string)[] {
    scene.updateMatrixWorld();
    const values: (number | string)[] = [camera.layers.mask, type];
    const matrix = (object: T.Object3D) => values.push(...object.matrixWorld.elements);
    const attribute = (a?: T.BufferAttribute | T.InterleavedBufferAttribute | null) => {
        if (a) values.push(a.count, a instanceof T.InterleavedBufferAttribute ? a.data.version : a.version);
        else values.push(-1);
    };
    const texture = (t?: T.Texture | null) => {
        if (!t) { values.push(-1); return; }
        if (t.matrixAutoUpdate) t.updateMatrix();
        values.push(t.id, t.version, t.channel, ...t.matrix.elements);
    };
    const material = (m: T.Material, custom = false) => {
        const surface = m as T.MeshStandardMaterial;
        // WebGLRenderer increments version while drawing double-sided transparent
        // surfaces. That is not a shadow edit. Track the actual depth inputs;
        // custom depth/distance shaders still use their explicit version.
        values.push(m.uuid, custom ? m.version : 0, +m.visible, m.side, m.shadowSide ?? -1, m.alphaTest, +m.alphaHash,
            +m.alphaToCoverage, +surface.wireframe, surface.wireframeLinewidth ?? 1,
            +m.clipShadows, +m.clipIntersection, m.opacity, surface.displacementScale ?? 0, surface.displacementBias ?? 0);
        texture(surface.map); texture(surface.alphaMap); texture(surface.displacementMap);
        for (const plane of m.clippingPlanes ?? []) values.push(...plane.normal.toArray(), plane.constant);
    };
    scene.traverseVisible(object => {
        if (object instanceof T.Light && object.castShadow) {
            const light = object as T.DirectionalLight | T.SpotLight | T.PointLight;
            const shadow = light.shadow;
            values.push(light.id, light.layers.mask, shadow.mapSize.x, shadow.mapSize.y, shadow.bias, shadow.normalBias, shadow.radius);
            matrix(light);
            if ('target' in light) { light.target.updateWorldMatrix(true, false); matrix(light.target); }
            values.push(...shadow.camera.projectionMatrix.elements);
            if (light instanceof T.SpotLight) values.push(light.angle, light.distance, light.penumbra);
            else if (light instanceof T.PointLight) values.push(light.distance);
            return;
        }
        if (!(object instanceof T.Mesh) || !(object.castShadow || type === T.VSMShadowMap && object.receiveShadow)) return;
        const geometry = object.geometry;
        values.push(object.id, object.layers.mask, +object.castShadow, +object.receiveShadow, geometry.id,
            geometry.drawRange.start, geometry.drawRange.count);
        matrix(object);
        attribute(geometry.index);
        for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) attribute(geometry.getAttribute(name));
        for (const attributes of Object.values(geometry.morphAttributes) as T.BufferAttribute[][]) for (const a of attributes) attribute(a);
        values.push(...(object.morphTargetInfluences ?? []));
        if (object instanceof T.SkinnedMesh) {
            values.push(...object.bindMatrix.elements, ...object.bindMatrixInverse.elements);
            for (const bone of object.skeleton.bones) matrix(bone);
        }
        if (object instanceof T.InstancedMesh) { values.push(object.count); attribute(object.instanceMatrix); texture(object.morphTexture); }
        for (const m of Array.isArray(object.material) ? object.material : [object.material]) material(m);
        if (object.customDepthMaterial) material(object.customDepthMaterial, true);
        if (object.customDistanceMaterial) material(object.customDistanceMaterial, true);
    });
    return values;
}

export class ShadowCache {
    private snapshots = new WeakMap<T.WebGLRenderer, (number | string)[]>();
    private deferred = new WeakSet<T.WebGLRenderer>();
    clear() { this.snapshots = new WeakMap(); this.deferred = new WeakSet(); }
    render(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.Camera, draw: () => void, force = false, interactive = false, freeze = false) {
        if (force || !renderer.shadowMap.enabled) {
            this.snapshots.delete(renderer); this.deferred.delete(renderer); draw(); return;
        }
        const next = shadowInputs(scene, camera, renderer.shadowMap.type);
        next.push(+renderer.localClippingEnabled);
        for (const plane of renderer.clippingPlanes) next.push(...plane.normal.toArray(), plane.constant);
        const previous = this.snapshots.get(renderer);
        // Warm every context normally first, so all samplers have allocated shadow textures.
        const frozen = interactive && freeze && !!previous;
        const simplified = interactive && previous && !frozen ? secondaryPreviewShadows(scene, camera) : [];
        const changed = !previous || next.length !== previous.length || next.some((value, index) => value !== previous[index])
            || this.deferred.has(renderer) && !simplified.length;
        const auto = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = !frozen && changed;
        const restore = simplified.map(light => {
            const shadow = light.shadow, {intensity, autoUpdate, needsUpdate} = shadow;
            // Uniform-only change: avoids recompiling all materials when a drag begins.
            shadow.intensity = 0; shadow.autoUpdate = false; shadow.needsUpdate = false;
            return () => { shadow.intensity = intensity; shadow.autoUpdate = autoUpdate; shadow.needsUpdate = needsUpdate; };
        });
        try {
            draw(); this.snapshots.set(renderer, next);
            if (simplified.length || frozen) this.deferred.add(renderer); else this.deferred.delete(renderer);
        }
        catch (error) { this.snapshots.delete(renderer); throw error; }
        finally { restore.forEach(fn => fn()); renderer.shadowMap.autoUpdate = auto; }
    }
}
