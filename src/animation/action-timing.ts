/** Recommended single performance durations; changing a clip's length still stretches that performance. */
export const ACTION_TIMING: Record<string, { duration: number; loop: boolean }> = {
    idle: { duration: 4, loop: true }, walk: { duration: 4, loop: true }, run: { duration: 4, loop: true },
    sit: { duration: 4, loop: true }, crouch: { duration: 4, loop: true }, crawl: { duration: 4, loop: true },
    lie: { duration: 4, loop: false }, guard: { duration: 3, loop: false }, point: { duration: 3, loop: false },
    wave: { duration: 3, loop: true }, push: { duration: 2.7, loop: true },
    standup: { duration: 1.1, loop: false }, jump: { duration: 1.3, loop: false }, turn: { duration: 1.2, loop: false },
    punch: { duration: 1, loop: false }, kick: { duration: 1.1, loop: false }, roundhouse: { duration: 1.4, loop: false },
    'flying-kick': { duration: 1.5, loop: false }, dodge: { duration: .9, loop: false }, throw: { duration: 1.4, loop: false },
    stumble: { duration: .6, loop: false }, roll: { duration: 1.5, loop: false }, fall: { duration: 2.4, loop: false },
};
export const actionDuration = (action: string) => ACTION_TIMING[action]?.duration ?? 3;
