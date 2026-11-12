import type {Vec3} from '../model.ts';

export interface TransformSample { position: Vec3; rotation: Vec3; scale: Vec3 }

/** Mouse input may outrun rendering. Apply its latest absolute transform once per frame. */
export class TransformQueue {
    private latest?: TransformSample;
    push(value: TransformSample) { this.latest = value; }
    clear() { this.latest = undefined; }
    flush(apply: (value: TransformSample) => void) {
        const value = this.latest; this.latest = undefined;
        if (!value) return false;
        apply(value); return true;
    }
}
