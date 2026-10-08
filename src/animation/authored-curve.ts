/** Quintic Hermite: matching velocity and zero acceleration at keys, including loop seams. */
export function authoredCurve(a: number, b: number, before: number, middle: number, after: number, span: number, t: number) {
    const slope = (x: number, y: number) => x * y > 0 ? 2 * x * y / (x + y) : 0;
    const v0 = slope(before, middle) * span, v1 = slope(middle, after) * span, delta = b-a;
    const c3=10*delta-6*v0-4*v1, c4=-15*delta+8*v0+7*v1, c5=6*delta-3*v0-3*v1;
    return a + t*(v0 + t*t*(c3 + t*(c4 + t*c5)));
}
