const os = require('node:os');

// App-owned Chromium processes only. CPU uses cumulative time so other readers
// of getAppMetrics cannot reset our measurement interval.
function createAppMetrics(read, { cores = os.cpus().length || 1, now = () => performance.now() } = {}) {
    let previous = new Map(), previousTime, cached;
    return () => {
        const time = now();
        if (cached && time - previousTime < 1000) return cached;
        const metrics = read(), current = new Map();
        let seconds = 0, cpuValid = previousTime !== undefined && metrics.length > 0;
        let memory = 0, memoryValid = metrics.length > 0;
        for (const metric of metrics) {
            const key = `${metric.pid}:${metric.creationTime}`;
            const total = metric.cpu?.cumulativeCPUUsage, before = previous.get(key);
            if (Number.isFinite(total) && total >= 0) {
                current.set(key, total);
                if (before !== undefined && total >= before) seconds += total - before;
                else cpuValid = false;
            } else cpuValid = false;
            const resident = metric.memory?.workingSetSize;
            if (Number.isFinite(resident) && resident >= 0) memory += resident * 1024;
            else memoryValid = false;
        }
        const elapsed = (time - previousTime) / 1000;
        cached = {
            cpu: cpuValid && elapsed > 0 ? Math.min(100, Math.max(0, seconds / elapsed / Math.max(1, cores) * 100)) : null,
            memoryBytes: memoryValid ? memory : null,
        };
        previous = current; previousTime = time;
        return cached;
    };
}
module.exports = { createAppMetrics };
