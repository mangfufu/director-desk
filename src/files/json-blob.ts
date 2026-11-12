/** Serialize plain project data without constructing one giant UTF-16 string.
 * Each Blob owns a bounded UTF-8 chunk; the file remains ordinary JSON.
 */
export function jsonBlob(value: unknown): Blob {
    const parts: Blob[] = [], ancestors = new Set<object>();
    let pending = '';
    const append = (text: string) => {
        pending += text;
        if (pending.length >= 65536) { parts.push(new Blob([pending])); pending = ''; }
    };
    const string = (text: string) => {
        append('"');
        for (let start = 0; start < text.length;) {
            let end = Math.min(start + 65536, text.length);
            // Keep paired surrogates in the same JSON.stringify call.
            if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
            append(JSON.stringify(text.slice(start, end)).slice(1, -1)); start = end;
        }
        append('"');
    };
    const omitted = (item: unknown) => item === undefined || typeof item === 'function' || typeof item === 'symbol';
    const write = (item: unknown) => {
        if (typeof item === 'string') { string(item); return; }
        if (item === null || typeof item !== 'object') { append(JSON.stringify(item) ?? 'null'); return; }
        if (ancestors.has(item)) throw new TypeError('Circular project data');
        ancestors.add(item);
        if (Array.isArray(item)) {
            append('['); for (let i = 0; i < item.length; i++) { if (i) append(','); write(item[i]); } append(']');
        } else {
            append('{'); let first = true;
            for (const [key, child] of Object.entries(item)) {
                if (omitted(child)) continue;
                if (!first) append(','); first = false; string(key); append(':'); write(child);
            }
            append('}');
        }
        ancestors.delete(item);
    };
    write(value); if (pending) parts.push(new Blob([pending]));
    return new Blob(parts, { type: 'application/json' });
}
