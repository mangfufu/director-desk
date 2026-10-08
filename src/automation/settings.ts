import { editorPreferences, preferenceDefaults, preferenceRanges } from '../editor/preferences.ts';
import { desktopFile } from './file-delivery.ts';
import { layoutControls } from '../ui/resizable-layout.ts';
import { libraryPreferences } from '../assets/library-preferences.ts';
import { findAsset } from '../asset-catalog.ts';

export async function editSettings(args: Record<string, unknown>) {
    if (args.scope === 'layout') {
        if (!layoutControls.read) throw Error('编辑器布局尚未就绪');
        if (args.action === 'reset') return layoutControls.reset!();
        if (args.action === 'set') {
            if (!args.patch || typeof args.patch !== 'object') throw Error('需要布局 patch');
            return layoutControls.set!(args.patch);
        }
        return layoutControls.read();
    }
    if (args.scope === 'assets') {
        if (args.action === 'reset') throw Error('请逐项设置收藏，避免清空已有收藏');
        if (args.action === 'set') {
            const patch = args.patch as { id?: string; favorite?: boolean };
            if (!patch || Object.keys(patch).some(k => !['id', 'favorite'].includes(k)) || !patch.id || !findAsset(patch.id) || typeof patch.favorite !== 'boolean') throw Error('收藏设置需要资产 id 和 favorite');
            if (libraryPreferences.favorites.includes(patch.id) !== patch.favorite) libraryPreferences.toggle(patch.id);
        }
        return { favorites: [...libraryPreferences.favorites], recent: [...libraryPreferences.recent] };
    }
    if (args.scope === 'files') {
        if (args.action === 'reset') throw Error('文件目录请明确提供目标路径');
        return desktopFile(args.action === 'set' ? 'set-locations' : 'locations', args.patch);
    }
    if (args.scope !== 'editor') throw Error('未知设置范围');
    if (args.action === 'set') {
        if (!args.patch || typeof args.patch !== 'object' || Array.isArray(args.patch)) throw Error('需要设置 patch');
        editorPreferences.patch(args.patch as Record<string, unknown>);
    } else if (args.action === 'reset') editorPreferences.reset();
    return { values: { ...editorPreferences.current }, defaults: preferenceDefaults, ranges: preferenceRanges };
}
