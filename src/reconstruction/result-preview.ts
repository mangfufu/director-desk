import { Engine } from '../engine.ts';
import type { Project } from '../model.ts';
import { Vector3 } from 'three';

/** Read-only result view, using exactly the editor's animation and camera evaluation. */
export class ReconstructionResultPreview {
    private engine: Engine;
    private stage = document.createElement('div');
    private shot = document.createElement('div');
    private aborter = new AbortController();
    private frame = 0;
    private disposed = false;
    private following = true;
    private selected = '';
    private focusPosition = new Vector3();
    private focusDelta = new Vector3();
    private last = 0;
    time = 0;
    playing = false;
    constructor(host: HTMLElement, private onTime: (time: number, playing: boolean) => void) {
        this.stage.className = this.shot.className = 'reconstruction-result-canvas';
        this.stage.hidden = true; host.append(this.stage, this.shot);
        const empty: Project = { format: 'director-desk', version: 2, name: '', duration: 1, fps: 24, aspect: '16:9',
            room: { enabled: false, width: 10, depth: 10, height: 3 }, entities: [], cuts: [], references: [] };
        this.engine = new Engine(empty, this.stage, this.shot, { select() {}, point() {}, ground() {}, transformStart() {}, transform() {}, transformEnd() {} });
        this.engine.pickingEnabled = false; this.engine.gridVisible = false; this.engine.jointNodesVisible = false;
    }
    async load(project: Project) {
        await this.engine.externalModels.prepare(project, this.aborter.signal);
        this.aborter.signal.throwIfAborted();
        this.update(project); this.frame = requestAnimationFrame(now => this.tick(now));
    }
    update(project: Project) {
        this.engine.rebuild(project); this.seek(this.time);
        if (!this.following && this.selected) this.engine.focus(this.selected);
        this.engine.render();
    }
    focus(id: string) {
        this.selected = id; this.following = false; this.stage.hidden = false; this.shot.hidden = true;
        this.engine.models.get(id)?.getWorldPosition(this.focusPosition);
        this.engine.resize(); this.engine.focus(id); this.engine.render();
    }
    follow() {
        this.following = true; this.stage.hidden = true; this.shot.hidden = false;
        this.engine.resize(); this.engine.render();
    }
    seek(time: number) {
        this.time = Math.max(0, Math.min(time, this.engine.project.duration));
        // The end handle displays the final output frame, not the half-open clip boundary.
        this.engine.sample(Math.min(this.time, Math.max(0, this.engine.project.duration - 1 / this.engine.project.fps)));
        if (!this.following && this.selected) {
            const root = this.engine.models.get(this.selected);
            if (root) {
                root.getWorldPosition(this.focusDelta); this.focusDelta.sub(this.focusPosition);
                this.engine.editorCamera.position.add(this.focusDelta); this.engine.orbit.target.add(this.focusDelta);
                this.focusPosition.add(this.focusDelta); this.engine.orbit.update();
            }
        }
        this.engine.render(); this.onTime(this.time, this.playing);
    }
    toggle() {
        if (!this.playing && this.time >= this.engine.project.duration) this.seek(0);
        this.playing = !this.playing; this.last = 0; this.onTime(this.time, this.playing);
    }
    pause() { this.playing = false; this.last = 0; this.onTime(this.time, false); }
    private tick(now: number) {
        if (this.disposed) return;
        if (!this.last || now - this.last >= 1000 / 30) {
            if (this.playing && this.last && !document.hidden) {
                const next = this.time + Math.min(.1, (now - this.last) / 1000);
                if (next >= this.engine.project.duration) this.playing = false;
                this.seek(next);
            } else this.engine.render(false);
            this.last = now;
        }
        this.frame = requestAnimationFrame(time => this.tick(time));
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.aborter.abort(); cancelAnimationFrame(this.frame);
        this.engine.dispose();
        this.engine.editorRenderer.forceContextLoss(); this.engine.shotRenderer.forceContextLoss();
        this.stage.remove(); this.shot.remove();
    }
}
