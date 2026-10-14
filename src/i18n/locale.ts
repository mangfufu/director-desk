import { english } from './en.ts';

export type Language = 'zh-CN' | 'en';
const key = 'director-ui-language';
let language: Language = 'zh-CN';
try { if (globalThis.localStorage?.getItem(key) === 'en') language = 'en'; } catch { /* Session-only preference. */ }
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function setLanguage(value: string) {
    if (value !== 'en' && value !== 'zh-CN') return;
    if (language === value) return;
    language = value;
    try { globalThis.localStorage?.setItem(key, value); } catch { /* Keep the session choice. */ }
    listeners.forEach(listener => listener());
}
export function onLanguageChange(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
const literalLength = (source: string) => source.replace(/\{\d+\}/g, '').length;
const patterns = Object.entries(english).filter(([source]) => source.includes('{0}')).sort(([a], [b]) => literalLength(b) - literalLength(a)).map(([source, translated]) => ({
    regex: new RegExp('^' + source.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '(.*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$'), translated,
}));
export function englishText(source: string) {
    const trimmed = source.trim(), normalized = trimmed.replace(/\s+/g, ' ');
    let translated = english[normalized];
    if (!translated) {
        const unit = /^(.*?) \/ (米|秒|度|m|s|°)$/.exec(normalized);
        if (unit && english[unit[1]]) translated = `${english[unit[1]]} (${({ 米: 'm', 秒: 's', 度: '°' } as Record<string,string>)[unit[2]] ?? unit[2]})`;
        const library = /^(基础|内置) \/ (.+)$/.exec(normalized);
        if (library && english[library[2]]) translated = `${library[1] === '基础' ? 'Basic' : 'Built-in'} / ${english[library[2]]}`;
        const group = /^(.*?) · ([\d.]+) 秒( · 待映射)?$/.exec(normalized);
        if (group && english[group[1]]) translated = `${english[group[1]]} · ${group[2]} s${group[3] ? ' · Mapping required' : ''}`;
    }
    if (!translated) for (const pattern of patterns) {
        const match = pattern.regex.exec(normalized);
        if (match) { translated = pattern.translated.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1]); break; }
    }
    return translated ? source.replace(trimmed, () => translated!) : source;
}
export const t = (source: string) => language === 'en' ? englishText(source) : source;
