import type { Waypoint } from '../model.ts';
import { stopsAtPoint } from '../animation/continuous-path.ts';
export {setPathMotionMode} from '../editor/path-editing.ts';

export const pathMotionChoices: Array<[string, string]> = [['segmented', '分段曲线'], ['continuous', '连贯运动']];
export const waypointMotionChoices: Array<[string, string]> = [['pass', '经过'], ['stop', '停住']];

export function waypointMotionValue(points: Waypoint[], index: number) {
    return (points[index] ? stopsAtPoint(points, index) : true) ? 'stop' : 'pass';
}
