/** Metadata shared by menus, MCP and offline help without loading the scene renderer. */
export const FEATURE_SCENES = [
    { id: 'light-stage', name: '光影舞台', type: '特色 · 12 秒', detail: '冷暖三点布光、灯光渐变、环绕与光学变焦' },
    { id: 'dolly-hall', name: '悬疑长廊', type: '特色 · 10 秒', detail: '希区柯克变焦：主体大小稳定，背景空间拉伸' },
    { id: 'neon-chase', name: '夜街追逐', type: '特色 · 10 秒', detail: '双人奔跑、冷暖街灯、手持晃动与广角畸变' },
] as const;
export type FeatureScene = typeof FEATURE_SCENES[number]['id'];
export const SCENE_TEMPLATES = [
    ...FEATURE_SCENES,
    { id: 'physics-stage', name: '动作与物理实验场', type: '特色 · 20 秒', detail: '新人物轮廓、动作、惯性对比、掉落碰撞与布娃娃' },
    { id: 'abstract-stage', name: '流光空间', type: '抽象 · 10 秒', detail: '粒子与漩涡、薄膜、镜面、折射和关键帧形变' },
    { id: 'bedroom', name: '卧室 · 四人调度', type: '室内', detail: '窗光与床头暖灯、家具配色、四人调度' },
    { id: 'room', name: '空房间', type: '室内', detail: '8 × 6 米，窗光、墙裙和木地板，留空布置' },
    { id: 'park', name: '林地空地', type: '室外', detail: '前后景树群、林间步道、长椅与双人调度' },
    { id: 'street', name: '街道', type: '室外', detail: '黄昏商铺、雨棚与花盆、人行道和路灯' },
    { id: 'courtyard', name: '庭院', type: '室外', detail: '入口门架、格栅凉棚、花坛与台阶平台' },
    { id: 'blank', name: '空白场地', type: '自由搭建', detail: '仅地面和摄影机，所有内容由你摆放' },
] as const;
export type SceneTemplate = typeof SCENE_TEMPLATES[number]['id'];
