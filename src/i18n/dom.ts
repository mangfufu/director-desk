import { englishText, getLanguage, onLanguageChange } from './locale.ts';
import './layout.css';

// Project text, conversations and third-party panels are never translated.
const protectedTree = 'pre,code,script,style,[contenteditable],[data-i18n-ignore],.object-name,#object-labels,#scene-switch,#shot-name,.modal-header p,#ai-channel,#ai-edit-channel,#skill-select,#ai-change-batch,#group-member,#replacement-camera,#hand-target,#floor-choice,#floor-assignment,#camera-target,#face-target,#retarget-source option:not([value^="basic-"]):not([value^="human-"]),#native-animation,#native-source,#scene-group-select option:not([value=""]),#scene-floor-filter option:not([value=""]):not([value="*"]),#export-camera option:not([value="program"]),.export-scene-check>span,.plugin-panel-content,#plugin-choice,#plugin-command,[data-act="plugins-run"],[data-act="versions-select"]>span,#resource-choice option:not([value=""]),#resource-entity option:not([value=""]),#note-select option:not([value=""]),#user-motion-list [data-motion-id],[data-field="camera.targetId"] option:not([value=""]),[data-field="faceTarget"] option:not([value=""])';
const protectedText = '.track-label[data-select],.timeline-clip.cut>span,[data-preview]:not([data-preview="program"])>span';
const protectedAttributes = '[data-user-motion-id],.motion-library-item:has([data-i18n-ignore]),#production-reference-preview img';
type Original = { source: string; rendered: string };

/** Localize presentation only. Input values and option IDs are not UI copy. */
export function mountLocalization() {
    const texts = new WeakMap<Text, Original>(), attributes = new WeakMap<Element, Map<string, Original>>();
    const pending = new Set<Node>();
    const attrs = ['title', 'aria-label', 'placeholder', 'alt'];
    const next = (value: string, previous?: Original): Original => {
        const source = previous && value === previous.rendered ? previous.source : value;
        return { source, rendered: getLanguage() === 'en' ? englishText(source) : source };
    };
    function visit(node: Node) {
        if (node instanceof Text) {
            const parent = node.parentElement;
            if (!parent || parent.closest(protectedTree + ',textarea') || parent.matches(protectedText)) return;
            if (!texts.has(node) && !/[\u3400-\u9fff]/.test(node.data)) return;
            const value = next(node.data, texts.get(node)); texts.set(node, value);
            if (getLanguage() === 'en' && parent.matches('[data-framing="全景"]')) value.rendered = 'Full Shot';
            if (node.data !== value.rendered) {
                if (parent instanceof HTMLOptionElement && !parent.hasAttribute('value')) parent.value = parent.textContent ?? '';
                node.data = value.rendered;
            }
            return;
        }
        if (!(node instanceof Element) || node.closest(protectedTree)) return;
        for (const attr of attrs) {
            if (node.matches(protectedAttributes)) continue;
            const current = node.getAttribute(attr); if (!current) continue;
            let record = attributes.get(node); if (!record) { record = new Map(); attributes.set(node, record); }
            const value = next(current, record.get(attr)); record.set(attr, value);
            if (current !== value.rendered) node.setAttribute(attr, value.rendered);
        }
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return;
        for (const child of node.childNodes) visit(child);
    }
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'childList') record.addedNodes.forEach(node => pending.add(node));
            else pending.add(record.target);
        }
        // Work within the current microtask; no observer on style/class or render canvases.
        for (const node of pending) if (node.isConnected) visit(node);
        pending.clear();
    });
    const apply = () => {
        window.directorDesktop?.setLanguage?.(getLanguage());
        document.documentElement.lang = getLanguage();
        visit(document.body);
    };
    apply();
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attrs });
    onLanguageChange(apply);
}
