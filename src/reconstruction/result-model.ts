import { assertProject, clone, type Project } from '../model.ts';
import { replaceActor } from '../resources/replace-actor.ts';
import type { EditOperation } from '../automation/edits.ts';

/** An appearance draft over an immutable recognition result. Source clocks stay untouched. */
export class ReconstructionResult {
    readonly choices = new Map<string, string>();
    project: Project;
    readonly source: Project;
    constructor(source: Project) { this.source = source; this.project = source; }
    choose(id: string, asset: string) {
        const original = this.source.entities.find(e => e.id === id);
        if (!original || original.kind !== 'actor') throw Error('请选择人形人物');
        const next = { ...this.project, entities: this.project.entities.map(e => e.id === id ? clone(original) : e) };
        if (asset !== original.asset) replaceActor(next, id, asset);
        assertProject(next);
        this.project = next;
        if (asset === original.asset) this.choices.delete(id); else this.choices.set(id, asset);
    }
    operations(): EditOperation[] {
        return [...this.choices].map(([id, asset]) => ({ operation: 'replace-actor', id, asset }));
    }
}
