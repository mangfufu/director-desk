import { FRAME_RATES } from '../model.ts';
export interface ExportPreferences { size: string; format: string; fps: string; directory: string }
const defaults: ExportPreferences = { size: '1920', format: 'mp4', fps: 'scene', directory: '' };
export function readExportPreferences(): ExportPreferences {
    try {
        const value = JSON.parse(localStorage.getItem('director-export-preferences') || '{}');
        return { size: ['640','1280','1920'].includes(value.size) ? value.size : defaults.size,
            format: ['mp4','webm'].includes(value.format) ? value.format : defaults.format,
            fps: ['scene', ...FRAME_RATES.map(String)].includes(value.fps) ? value.fps : defaults.fps,
            directory: typeof value.directory === 'string' ? value.directory : '' };
    } catch { return { ...defaults }; }
}
export function saveExportPreferences(value: ExportPreferences) {
    try { localStorage.setItem('director-export-preferences', JSON.stringify(value)); } catch { /* Export still works without local storage. */ }
}
