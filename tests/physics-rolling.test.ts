import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import * as C from 'cannon-es';
import { demoProject, entity } from '../src/model.ts';
import { makeProp } from '../src/assets/props.ts';
import { defaultPhysicsBody, defaultPhysicsWorld } from '../src/physics/model.ts';
import { PhysicsRuntime } from '../src/physics/runtime.ts';
import { RigidBody } from '../src/physics/rigid-body.ts';

function ballWorld(shape: 'auto' | 'sphere', velocity = 2, spin = -4) {
    const ball = entity('prop', 'shape-sphere', '球', [0, 0, 0]);
    ball.physics = { ...defaultPhysicsBody(), shape, friction: .6, restitution: 0, damping: 0,
        velocity: [velocity, 0, 0], angularVelocity: [0, 0, spin] };
    const project = demoProject(); project.room.enabled = false; project.entities = [ball]; project.physics = defaultPhysicsWorld();
    const scene = new T.Scene(), root = makeProp(ball); scene.add(root);
    const runtime = new PhysicsRuntime(new Map([[ball.id, root]]), () => undefined, () => new T.Group());
    const baseline = () => { runtime.restore(); root.position.fromArray(ball.position); root.rotation.set(...ball.rotation);
        root.scale.fromArray(ball.scale); scene.updateMatrixWorld(true); };
    const sample = (time: number) => {
        baseline(); runtime.sample(project, time, baseline); scene.updateMatrixWorld(true);
        const mesh = root.children[0] as T.Mesh; mesh.geometry.computeBoundingBox();
        return { center: mesh.geometry.boundingBox!.getCenter(new T.Vector3()).applyMatrix4(mesh.matrixWorld),
            rotation: root.getWorldQuaternion(new T.Quaternion()), root: root.position.clone() };
    };
    return { sample, runtime, ball, project, root };
}

for (const shape of ['auto', 'sphere'] as const) test(`${shape} sphere rolls around its center, keeps ground contact and repeats on seek`, () => {
    const world = ballWorld(shape);
    const samples = Array.from({ length: 61 }, (_, i) => world.sample(i / 30));
    for (const state of samples) assert.ok(Math.abs(state.center.y - .5) < .008, `rolling center height: ${state.center.y}`);
    const a = samples[30], b = samples[33], angle = a.rotation.angleTo(b.rotation), distance = b.center.distanceTo(a.center);
    assert.ok(angle > .2, 'the sphere must rotate while travelling');
    assert.ok(Math.abs(distance - .5 * angle) < .01, 'travel must match rolling rather than sliding/orbiting');
    const queried = world.runtime.rootAt(world.ball.id, 2)!;
    assert.ok(queried.position.distanceTo(samples[60].root) < 1e-9, 'spatial queries use the rendered asset root');
    world.sample(.1); assert.deepEqual(world.sample(2), samples[60]);
    world.runtime.invalidate(); assert.deepEqual(world.sample(2), samples[60]);
});

test('a sliding sphere gains spin through contact friction and settles into rolling', () => {
    const world = ballWorld('sphere', 2, 0);
    const a = world.sample(1), b = world.sample(1.1);
    const distance = b.center.x - a.center.x, angle = a.rotation.angleTo(b.rotation);
    assert.ok(angle > .15, 'ground friction must produce rotation');
    assert.ok(Math.abs(distance - angle * .5) < .01, 'contact point stops sliding');
    // A solid sphere released without spin retains 5/7 of its initial horizontal speed.
    assert.ok(Math.abs(distance / .1 - 10 / 7) < .04, 'sphere inertia must not use the bounding-box inertia');
});

test('a frictionless ball slides without fabricated rotation', () => {
    const world = ballWorld('sphere', 2, 0); world.ball.physics!.friction = 0;
    const a = world.sample(0), b = world.sample(1);
    assert.ok(Math.abs(b.center.x - a.center.x - 2) < .005);
    assert.ok(a.rotation.angleTo(b.rotation) < 1e-8);
});

test('centered rigid-body inertia is local and independent of world rotation', () => {
    for (const shape of [new C.Sphere(.5), new C.Box(new C.Vec3(.2, .4, .8))]) {
        const body = new RigidBody({ mass: 5 }); body.addShape(shape);
        const expected = shape.calculateLocalInertia(5, new C.Vec3());
        for (const angle of [0, .7, 1.4]) {
            body.quaternion.setFromEuler(angle, .3, .8); body.updateMassProperties();
            assert.deepEqual(body.inertia, expected);
        }
    }
});

test('grounded ball pivot and rotated/offset parent remain unchanged until release', () => {
    const world = ballWorld('sphere', 0, 0); world.ball.position = [0, 2, 0]; world.ball.rotation = [0, 0, .7];
    world.ball.physics!.start = 1; world.ball.physics!.gravity = false; world.ball.physics!.collisions = false;
    world.root.parent!.position.set(3, 1, 4); world.root.parent!.rotation.y = .4;
    const before = world.sample(.9), released = world.sample(1), after = world.sample(1.5);
    assert.ok(before.center.distanceTo(released.center) < 1e-8);
    assert.ok(before.center.distanceTo(after.center) < 1e-8);
    assert.ok(before.rotation.angleTo(after.rotation) < 1e-7);
    assert.ok(before.root.distanceTo(after.root) < 1e-8);
});
