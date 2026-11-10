/** Temporary preview quality only; never mutates saved scene/output settings. */
export class InteractionPreview {
    active = false;
    draft = false;
    private slowFrames = 0;
    update(active: boolean, enabled: boolean) {
        this.active = active && enabled;
        const before = this.draft;
        if (!this.active) { this.draft = false; this.slowFrames = 0; }
        return before !== this.draft;
    }
    record(milliseconds: number) {
        if (!this.active || this.draft || !Number.isFinite(milliseconds)) return false;
        this.slowFrames = milliseconds > 20 ? this.slowFrames + 1 : 0;
        if (this.slowFrames < 2) return false;
        this.draft = true;
        return true;
    }
}
