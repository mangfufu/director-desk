import { readBuiltinSkill } from './skill.ts';

/** Reuse the shipped references rather than maintaining a second parameter manual. */
export const HELP_TOPICS = {
    editing: 'references/editing.md',
    camera: 'references/camera.md',
    media: 'references/media.md',
    physics: 'references/physics.md',
    files: 'references/files.md',
    extensions: 'references/extensions.md',
    production: 'references/prompt-writing.md',
    project: 'references/project-format.md',
} as const;

export function topicHelp(topic: string) {
    if (!Object.hasOwn(HELP_TOPICS, topic)) throw Error('未知帮助主题：' + topic);
    const path = HELP_TOPICS[topic as keyof typeof HELP_TOPICS];
    return { topic, ...readBuiltinSkill(undefined, path) };
}
