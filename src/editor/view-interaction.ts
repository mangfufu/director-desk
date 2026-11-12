/** Include pointer gestures, wheel input and their damping tail in adaptive preview. */
export class ViewInteraction {
    private held = false;
    private until = -Infinity;
    active(now: number) { return this.held || now < this.until; }
    start() { this.held = true; }
    end(now: number) { this.held = false; this.touch(now); }
    touch(now: number) { this.until = now + 150; }
    changed(now: number) { if (this.active(now)) this.touch(now); }
    clear() { this.held = false; this.until = -Infinity; }
}
