import type { SpatialReport } from './report.ts';
import type { SampleVisibility } from './visibility.ts';

function visibilitySummary({ status, blockers }: SampleVisibility) {
    const blocker = blockers[0];
    return { status, ...(blocker && { blocker: { key: blocker.key, name: blocker.name } }) };
}

export function framingSummary({ time, camera, objects }: SpatialReport) {
    return { time, camera: { id: camera.id, name: camera.name },
        objects: objects.map(({ key, entityId, name, framing, visibility }) => ({
            key, entityId, name, framing, ...(visibility && {
                visibility: { body: visibilitySummary(visibility.body), face: visibilitySummary(visibility.face) },
            }),
        })),
    };
}
