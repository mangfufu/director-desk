import type { SceneDocument } from '../scenes/sequence-project.ts';
/** Legacy files lack an ID. Stable content identity keeps their local versions discoverable
 * when reopened before the user saves the upgraded file. New projects still use fresh UUIDs. */
export async function identifyImportedDocument(document: SceneDocument) {
    if (!document.projectId) {
        const bytes = new TextEncoder().encode(JSON.stringify(document));
        const hash = await crypto.subtle.digest('SHA-256',bytes);
        document.projectId = 'legacy:' + Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
    }
    return document;
}
