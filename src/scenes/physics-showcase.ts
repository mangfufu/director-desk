import { clip, demoProject, type Project } from '../model.ts';
import { defaultPhysicsBody, defaultPhysicsWorld, type PhysicsBody } from '../physics/model.ts';
import { defaultLighting } from '../lighting/model.ts';
import { templateBuilder } from './template-builder.ts';
import { defaultSurfaceLayer } from '../media/model.ts';

/** An editable demonstration: the scene uses ordinary actions, paths and physics inputs. */
export function createPhysicsShowcase(): Project {
    const p = demoProject();
    p.name = '动作与物理实验场'; p.duration = 20; p.aspect = '16:9';
    p.entities = []; p.cuts = []; p.references = []; p.room.enabled = false;
    p.physics = defaultPhysicsWorld();
    p.lighting = { ...defaultLighting(), defaultLights: false, ambient: 1.4, background: '#17191d', groundColor: '#3b3e43' };
    const { add, box, light, camera } = templateBuilder(p);
    const body = (patch: Partial<PhysicsBody> = {}): PhysicsBody => ({ ...defaultPhysicsBody(), ...patch });
    add('prop', 'ground', '实验场地面', [0, 0, 0], '#46494e', [4, 1, 4]);
    // Decorative markers are not physical obstacles.
    const marker = (name: string, x: number, z: number, color: string) => {
        const e = box(name, [x, .006, z], [1.6, .012, .08], color); e.physics = body({ enabled: false });
    };
    const label = (text: string, x: number, z: number) => {
        const e = add('prop', 'visual-text', text, [x, 2.8, z], '#dddddd'); e.visual!.text = text; e.visual!.size = .7; return e;
    };
    const labels = [label('动作', -6, -6.5), label('惯性', 0, -1.7), label('掉落与碰撞', 7, -5), label('布娃娃', 0, 4.5)];

    const adult = add('actor', 'human-adult', '成年人物 · 出拳与踢腿', [-8, 0, -5], '#c7cbd0');
    adult.clips = [clip('guard', 0, .2), clip('punch', .2, 1.2), clip('guard', 1.2, 1.5), clip('kick', 1.5, 2.6), clip('guard', 2.6, 4)];
    const female = add('actor', 'human-female', '女性人物 · 防御与抛掷', [-6, 0, -5], '#949ba6');
    female.clips = [clip('guard', 0, .3), clip('throw', .3, 1.7), clip('guard', 1.7, 4)];
    const dwarf = add('actor', 'human-dwarf', '矮人 · 踉跄与翻滚', [-4, 0, -5], '#d6d2ca');
    dwarf.clips = [clip('wave', 0, 1.4), clip('idle', 1.4, 1.7), clip('roll', 1.7, 3.2), clip('idle', 3.2, 20)];

    for (const [inertia, z, color] of [[true, -.4, '#bec7d4'], [false, 1.4, '#807c76']] as const) {
        const e = box(inertia ? '保留惯性 · 滑行' : '关闭惯性 · 停住', [-4, 0, z], [.7, .7, .7], color);
        e.physics = body({ start: 4, mass: 2, gravity: false, inertia, damping: 0, friction: 0, restitution: .15,
            impulses: [{ time: 4, impulse: [6.4, 0, 0], point: [0, 0, 0] }] });
        for (const x of [-4, -2, 0, 2, 4]) marker('滑行距离标记', x, z + .55, '#7e838b');
    }
    box('滑行终点挡板', [4.7, 0, .5], [.25, 1.1, 3.1], '#989da6');

    box('落物平台', [7, 0, -2.8], [3.4, .35, 2.3], '#777c84');
    const drop = box('掉落方块', [7, 3.7, -2.8], [.75, .75, .75], '#d1c5b2');
    drop.physics = body({ start: 8, mass: 2, damping: .12, restitution: .25 });
    const ball = add('prop', 'shape-sphere', '弹跳球', [5.6, 3.5, -1.1], '#afbfd0', [.85, .85, .85]);
    // A tiny grayscale UV pattern makes physical rotation visible without adding meshes.
    const patternId = 'media-2e513f12411f709a078937c4d8f704828610838f8fad563c08efd4bbaae39728';
    p.media = [{ id: patternId, name: '球体滚动标记', mime: 'image/png', width: 64, height: 32, duration: 0,
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAQklEQVR4nO3PQQkAQAwDwQo7/2Zq4jSkUOhjImDJVId74bb7BQAAAAAAAAAAAAAwBlw7lPYBAAAAAAAAAAAAAMb9Dx651MS4ZWpuAAAAAElFTkSuQmCC' }];
    ball.surface = { layers: [defaultSurfaceLayer(patternId, 'ball-roll-markings')] };
    ball.physics = body({ start: 8.25, shape: 'auto', mass: 1, restitution: .45, friction: .3, damping: .05,
        velocity: [1.6, 0, .2] });

    const runner = add('actor', 'human-muscular', '奔跑人物 · 受力倒地', [-5, 0, 6], '#a7b9c8');
    runner.clips = [clip('idle', 0, 12), clip('run', 12, 14)];
    runner.path = { smooth: false, points: [{ time: 0, position: [-5, 0, 6] }, { time: 12, position: [-5, 0, 6], stop: true }, { time: 13.5, position: [-1, 0, 6] }] };
    runner.physics = body({ start: 13.5, mass: 70, ragdoll: true, damping: .18, friction: .7, restitution: .05,
        impulses: [{ time: 13.5, impulse: [140, 175, 20], point: [0, .15, 0] }] });
    for (const x of [-5, -3, -1, 1, 3]) marker('奔跑距离标记', x, 7.1, '#737a84');

    light('light-area', '正面柔光', [-3, 8, 7], [0, 0, 0], '#ffffff', 8);
    const rim = light('light-spot', '侧后轮廓光', [5, 7, -8], [0, 1, 0], '#d2d8e1', 380);
    rim.light!.angle = 65; rim.light!.penumbra = .8;
    const actions = camera('A · 人物动作', [-6, 2.2, 1.5], [-6, 1.1, -5], 34);
    const glide = camera('B · 惯性对比', [0, 4.8, 11], [0, .45, .5], 28, 4);
    glide.path = { smooth: false, interpolation: 'continuous', points: [{ time: 4, position: [0, 4.8, 11], stop: true }, { time: 8, position: [.6, 4.4, 10], stop: true }] };
    const falling = camera('C · 掉落与弹跳', [11, 6, 9.5], [7.5, 1.4, -1.5], 26, 8);
    const fall = camera('D · 奔跑与受力', [-2, 2.3, 13], [-1, .9, 6], 25, 12);
    fall.path = { smooth: false, interpolation: 'continuous', points: [{ time: 12, position: [-2, 2.3, 13], stop: true }, { time: 18, position: [2.5, 2.7, 12], stop: true }] };
    fall.camera!.targetPath = { smooth: false, interpolation: 'continuous', points: [{ time: 12, position: [-1, .9, 6], stop: true }, { time: 14.2, position: [1.5, .85, 6] }, { time: 17.5, position: [2.4, .6, 6], stop: true }] };
    for (const [i, shot] of [actions, glide, falling, fall].entries()) shot.camera!.hiddenEntityIds = labels.filter((_, index) => index !== i).map(e => e.id);
    glide.camera!.hiddenEntityIds!.push(drop.id, ball.id);
    camera('E · 实验场全景', [15, 15, 22], [0, 0, .5], 28, 18);
    p.production = { fixedPrompt: '', sceneReferenceIds: [], notes: [
        { id: 'physics-actions', start: 0, end: 4, actorId: adult.id, story: '三种人物轮廓分别展示出拳、踢腿、防御、抛掷和翻滚。', emotion: '专注', action: '各自练习，互不击打。', dialogue: '' },
        { id: 'physics-inertia', start: 4, end: 8, actorId: '', story: '两个方块受到相同冲量；保留惯性的方块持续滑行，另一块停在起点附近。', emotion: '', action: '滑行方块在终点撞到挡板。', dialogue: '' },
        { id: 'physics-drop', start: 8, end: 12, actorId: '', story: '方块掉落到平台上，球体落地弹跳。', emotion: '', action: '重力、碰撞与弹性对比。', dialogue: '' },
        { id: 'physics-ragdoll', start: 12, end: 18, actorId: runner.id, story: '人物先按路径奔跑，受力后进入布娃娃，落地逐渐停住。', emotion: '失去平衡', action: '继承奔跑速度，受力、翻倒、落地。', dialogue: '' },
        { id: 'physics-overview', start: 18, end: 20, actorId: '', story: '全景展示各区域的最终状态。', emotion: '', action: '镜头停留。', dialogue: '' },
    ], promptText: `参考 @视频1 生成三维白模演示片段。16:9，时长20秒。保持参考视频的运镜、景别、构图、切镜节奏、对象站位、走位和位移节奏。人物和道具沿用视频中的轮廓与颜色，不增加画面外人物。无对白、无配乐、无字幕；保留碰撞和落地的动作声。

cut1:
[00:00—00:04]
主要人物：成年人物、女性人物、矮人
三人各自练习身体动作，展示出拳、踢腿、防御、抛掷和翻滚，互不击打。

cut2:
[00:04—00:08]
主要画面：两块方块、距离标记、终点挡板
相同受力后，浅色方块继续滑行，深色方块停在起点附近。浅色方块在终点碰到挡板。

cut3:
[00:08—00:12]
主要画面：平台、方块、球体
方块从高处落到平台，球体落地后弹起，逐渐降低弹跳高度。

cut4:
[00:12—00:18]
主要人物：奔跑人物
人物加速奔跑，受到外力后失去平衡，身体翻倒并落地，随后逐渐停住。

cut5:
[00:18—00:20]
主要画面：实验场各区域
展示各区域最终状态，不重新播放已经完成的动作。` };
    return p;
}
