/** Grow the detector only when its result fills every available slot. */
export function automaticPeopleDetector(model: {
    setOptions(options: {numPoses: number}): Promise<void>;
    detectForVideo(image: HTMLCanvasElement, timestamp: number): any;
}, initialCapacity = 2) {
    let capacity = initialCapacity, timestamp = -1;
    return async (image: HTMLCanvasElement, videoTimeMs: number) => {
        for (;;) {
            // MediaPipe requires increasing timestamps, including retries of one frame.
            timestamp = Math.max(timestamp + 1, videoTimeMs);
            const result = model.detectForVideo(image, timestamp);
            if (result.landmarks.length < capacity) return result;
            capacity *= 2;
            await model.setOptions({numPoses: capacity});
        }
    };
}
