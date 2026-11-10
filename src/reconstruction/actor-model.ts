import { HUMAN_ASSETS } from '../assets/catalog/humans.ts';

export const RECONSTRUCTION_ACTOR_MODELS = ['source', ...HUMAN_ASSETS.map(asset => asset.id)];
export function reconstructionActorModel(value: unknown = 'source'): string {
    if (typeof value !== 'string' || !RECONSTRUCTION_ACTOR_MODELS.includes(value)) throw Error('请选择识别模型或内置人物模型');
    return value;
}
