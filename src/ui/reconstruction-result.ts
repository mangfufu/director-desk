import { HUMAN_ASSETS } from '../assets/catalog/humans.ts';
import { desktopFile } from '../files/desktop-output.ts';
import { projectForScene, readSceneDocument } from '../scenes/sequence-project.ts';
import { ReconstructionResult } from '../reconstruction/result-model.ts';
import { ReconstructionResultPreview } from '../reconstruction/result-preview.ts';
import { entityVisibleAt } from '../scenes/visibility.ts';
import { escape, options } from './common.ts';
import { t } from '../i18n/locale.ts';

interface ResultHosts {
    people: HTMLElement; transport: HTMLElement; space: HTMLElement; player: HTMLVideoElement;
    error(message: string): void; changed(): void;
}

/** Result choices remain local until Open Project, without editing the user's current scene. */
export function createReconstructionResultUI(hosts: ResultHosts, path: string, sourceStart: number, saved: Map<string, string>) {
    let active = true, model: ReconstructionResult | undefined, preview: ReconstructionResultPreview | undefined;
    let selected = '', ready = false;
    let sourceTime = sourceStart, sourcePlaying = false;
    const sourceControls = hosts.player.controls;
    hosts.people.hidden = false;
    hosts.people.innerHTML = `<strong>${t('人物')}</strong><p role="status">${t('加载结果')}</p>`;
    hosts.transport.innerHTML = `<button type="button" data-result-play>${t('播放')}</button><input type="range" data-result-time min="0" max="1" step="0.01" value="0" aria-label="${t('播放位置')}"><output></output><button type="button" data-result-follow>${t('跟随镜头')}</button>`;
    const slider = hosts.transport.querySelector<HTMLInputElement>('[data-result-time]')!;
    const play = hosts.transport.querySelector<HTMLButtonElement>('[data-result-play]')!;
    function syncSource() {
        if (!active) return;
        const video = hosts.player;
        if (Number.isFinite(video.duration) && !video.seeking && Math.abs(video.currentTime-sourceTime) > (sourcePlaying ? .15 : .025)) video.currentTime = Math.min(sourceTime, video.duration);
    }
    hosts.player.addEventListener('seeked', syncSource);
    hosts.player.addEventListener('loadedmetadata', syncSource);
    const hidden = () => { if (document.hidden) preview?.pause(); };
    document.addEventListener('visibilitychange', hidden);
    function frame(time: number, playing: boolean) {
        if (!active) return;
        slider.value = String(time); play.textContent = t(playing ? '暂停' : '播放');
        hosts.transport.querySelector('output')!.textContent = `${time.toFixed(1)} / ${model?.project.duration.toFixed(1)} s`;
        sourceTime = sourceStart + time;
        const changed = sourcePlaying !== playing; sourcePlaying = playing;
        if (!playing) hosts.player.pause();
        syncSource();
        // Decode continuously during playback; only correct drift, not seek on every frame.
        if (changed && playing && hosts.player.src) void hosts.player.play().catch(() => {});
    }
    function choosePerson(id: string) {
        if (!model || !preview) return;
        selected = id; preview.pause();
        const actor = model.project.entities.find(e => e.id === id)!;
        if (!entityVisibleAt(actor, preview.time)) preview.seek(actor.visibility?.[0]?.start ?? actor.clips[0]?.start ?? 0);
        preview.focus(id);
        hosts.people.querySelectorAll<HTMLButtonElement>('[data-result-person]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resultPerson === id)));
    }
    function people() {
        const actors = model!.project.entities.filter(e => e.kind === 'actor');
        hosts.people.innerHTML = `<strong>${t('人物')}</strong><div class="reconstruction-person-list">${actors.map(e => {
            const original = model!.source.entities.find(s => s.id === e.id)!;
            const choices: [string, string][] = [[original.asset, original.asset==='external-model'?t('原识别外形'):HUMAN_ASSETS.find(a=>a.id===original.asset)?.name??t('当前模型')], ...HUMAN_ASSETS.filter(a => a.id !== original.asset).map(a => [a.id, a.name] as [string,string])];
            return `<div class="reconstruction-person"><button type="button" data-result-person="${escape(e.id)}" aria-pressed="${selected === e.id}"><span class="reconstruction-person-color" style="background:${escape(e.color)}"></span><span>${escape(e.name)}</span></button><select data-result-model="${escape(e.id)}" aria-label="${escape(e.name)} · ${t('人物外形')}">${options(choices,e.asset)}</select></div>`;
        }).join('') || `<p>${t('未识别到人物')}</p>`}</div>`;
        hosts.people.querySelectorAll<HTMLButtonElement>('[data-result-person]').forEach(button => button.onclick = () => choosePerson(button.dataset.resultPerson!));
        hosts.people.querySelectorAll<HTMLSelectElement>('[data-result-model]').forEach(select => select.onchange = () => {
            const id = select.dataset.resultModel!, previous = model!.project.entities.find(e => e.id === id)!.asset;
            try {
                model!.choose(id, select.value); preview!.update(model!.project); choosePerson(id);
                saved.clear(); model!.choices.forEach((value,key) => saved.set(key,value)); hosts.error('');
            } catch (error) {
                // Keep both the select and the staged project on the last valid result.
                model!.choose(id, previous); preview!.update(model!.project); select.value = previous;
                hosts.error((error as Error).message);
            }
        });
    }
    async function load() {
        try {
            const file = await desktopFile('automation-read', { kind: 'project', path });
            if (!active) return;
            model = new ReconstructionResult(projectForScene(readSceneDocument(JSON.parse(file.content!))));
            for (const [id,asset] of saved) model.choose(id,asset);
            preview = new ReconstructionResultPreview(hosts.space, frame);
            await preview.load(model.project);
            if (!active) return;
            slider.max = String(model.project.duration);
            selected = model.project.entities.find(e => e.kind === 'actor')?.id ?? '';
            hosts.player.pause(); hosts.player.controls = false;
            people(); ready = true; hosts.transport.hidden = false; hosts.changed();
        } catch (error) {
            preview?.dispose(); preview = undefined;
            if (active) {
                hosts.error((error as Error).message);
                hosts.people.innerHTML = `<button type="button">${t('重试')}</button>`;
                hosts.people.querySelector('button')!.onclick = () => { hosts.error(''); void load(); };
            }
        }
    }
    play.onclick = () => preview?.toggle();
    slider.oninput = () => { const time = Number(slider.value); preview?.pause(); preview?.seek(time); };
    hosts.transport.querySelector<HTMLButtonElement>('[data-result-follow]')!.onclick = () => preview?.follow();
    void load();
    return {
        get ready() { return ready; }, get selected() { return selected; }, get time() { return preview?.time ?? 0; },
        operations: () => model?.operations() ?? [], pause: () => preview?.pause(),
        setBusy(busy: boolean) {
            for (const host of [hosts.people,hosts.transport]) host.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(control => { control.disabled = busy; });
            if (busy) preview?.pause();
        },
        dispose() {
            active = false; preview?.dispose(); hosts.player.pause(); hosts.player.controls = sourceControls;
            hosts.player.removeEventListener('seeked', syncSource); hosts.player.removeEventListener('loadedmetadata', syncSource);
            document.removeEventListener('visibilitychange', hidden);
            hosts.people.replaceChildren(); hosts.people.hidden = true; hosts.transport.replaceChildren(); hosts.transport.hidden = true;
        },
    };
}
