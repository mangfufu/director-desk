import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

await fs.mkdir('tmp/physics-showcase', { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null } }); await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`); await page.waitForFunction(() => window.__director);
    await page.locator('[data-menu="file"]').click(); await page.locator('[data-act="scene-templates"]').click();
    await page.locator('input[name="scene-template"][value="physics-stage"]').check();
    await page.locator('[data-act="confirm-new"]').click();
    assert.equal(await page.evaluate(() => window.__director.getProject().name), '动作与物理实验场');
    const sampled = await page.evaluate(() => {
        const api = window.__director, engine = api.getEngine(), p = api.getProject();
        const id = word => p.entities.find(e => e.name.includes(word)).id;
        const root = word => engine.models.get(id(word));
        const frames = [];
        for (const time of [1.5, 3.5, 4, 6, 7.9, 8, 8.6, 9.5, 11.4, 11.6, 11.9, 12, 13.5, 14.2, 16, 18, 19.95]) {
            const canvas = engine.renderOutput(time, 960, 540, 'program');
            const ball = root('弹跳球'); let ballMesh; ball.traverse(node => { if (node.geometry?.type === 'SphereGeometry') ballMesh = node; });
            const center = ballMesh.geometry.boundingBox.getCenter(engine.proxy.position.clone()).applyMatrix4(ballMesh.matrixWorld);
            frames.push({ time, image: canvas.toDataURL(), glideX: root('保留惯性').position.x, stoppedX: root('关闭惯性').position.x,
                ballCenter: center.toArray(), ballRotation: ball.getWorldQuaternion(ball.quaternion.clone()).toArray(),
                dropY: root('掉落方块').position.y, ragdoll: engine.rigs.get(id('奔跑人物')).hips.getWorldPosition(engine.proxy.position.clone()).toArray() });
        }
        engine.sample(14.2); const end = root('奔跑人物').matrixWorld.toArray(); engine.sample(1); engine.sample(14.2);
        return { frames, end, repeated: root('奔跑人物').matrixWorld.toArray() };
    });
    assert.deepEqual(sampled.end, sampled.repeated);
    console.log('Showcase samples',sampled.frames.map(({time,glideX,stoppedX,dropY,ragdoll})=>({time,glideX,stoppedX,dropY,ragdoll})));
    for (const { time, image } of sampled.frames) await fs.writeFile(`tmp/physics-showcase/frame-${time}.png`, Buffer.from(image.split(',')[1], 'base64'));
    const at = t => sampled.frames.find(f => f.time === t);
    assert.ok(at(6).glideX - at(6).stoppedX > 5); assert.ok(at(7.9).glideX < 4.4, 'glider cannot cross the end barrier');
    assert.ok(at(8).dropY > 3); assert.ok(at(9.5).dropY < 1, 'falling cube lands on the platform');
    const ballA = at(11.4), ballB = at(11.6), dot = Math.abs(ballA.ballRotation.reduce((sum, v, i) => sum + v * ballB.ballRotation[i], 0));
    const rollAngle = 2 * Math.acos(Math.min(1, dot)), travel = Math.hypot(ballB.ballCenter[0] - ballA.ballCenter[0], ballB.ballCenter[2] - ballA.ballCenter[2]);
    assert.ok(Math.abs(ballA.ballCenter[1] - ballB.ballCenter[1]) < .01, 'settled rolling center remains level');
    assert.ok(rollAngle > .1 && Math.abs(travel - .425 * rollAngle) < .015, 'actual rendered ball rolls instead of sliding');
    assert.ok(at(16).ragdoll[1] < 1, 'ragdoll falls down');
    await page.evaluate(() => window.__director.setTime(1.5)); await page.screenshot({ path: 'tmp/physics-showcase/workspace.png' });
    const bytes = await page.evaluate(() => window.__director.exportForTest({ width: 640, height: 360, fps: 24, cameraId: 'program', monochrome: false, start: 0, end: 20, format: 'mp4' }));
    assert.ok(bytes.length > 100000); await fs.writeFile('tmp/physics-showcase/demo.mp4', Buffer.from(bytes));
    const project = await page.evaluate(() => window.__director.getDocument());
    await fs.writeFile('tmp/physics-showcase/动作与物理实验场.director', JSON.stringify(project));
    assert.deepEqual(errors, []); console.log('Template creation, inertia/collision/drop/ragdoll, cut boundaries, seeking and full 20s MP4 passed.');
} finally { await browser.close(); await server.close(); }
