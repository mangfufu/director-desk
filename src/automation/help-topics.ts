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

const guide = readBuiltinSkill(undefined, 'references/operations.md');
const sections = guide.instructions!.split(/^## ([a-z-]+)$/m);
const operations = new Map<string, string>();
for (let i = 1; i < sections.length; i += 2) operations.set(sections[i], sections[i + 1].trim());
export const HELP_OPERATIONS = [...operations.keys()];

export function operationHelp(requested: readonly string[]) {
    const selected = [...new Set(requested)];
    if (!selected.length) throw Error('请指定要查的操作');
    const instructions = selected.map(operation => {
        const section = operations.get(operation);
        if (!section) throw Error('未知帮助操作：' + operation);
        return '## ' + operation + '\n\n' + section;
    }).join('\n\n');
    return { operations: selected, name: guide.name, version: guide.version, releaseVersion: guide.releaseVersion, path: guide.path, instructions };
}
