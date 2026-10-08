import * as C from 'cannon-es';

/** Cannon's default uses the world AABB as a box, including for spheres. */
export class RigidBody extends C.Body {
    override updateMassProperties() {
        super.updateMassProperties();
        const shape = this.shapes[0], offset = this.shapeOffsets[0], rotation = this.shapeOrientations[0];
        if (this.shapes.length !== 1 || !(shape instanceof C.Sphere || shape instanceof C.Box) ||
            offset.lengthSquared() > 1e-12 || Math.abs(rotation.w) < 1 - 1e-10) return;
        shape.calculateLocalInertia(this.mass, this.inertia);
        const { x, y, z } = this.inertia;
        this.invInertia.set(x > 0 && !this.fixedRotation ? 1 / x : 0,
            y > 0 && !this.fixedRotation ? 1 / y : 0, z > 0 && !this.fixedRotation ? 1 / z : 0);
        this.updateInertiaWorld(true);
    }
}
