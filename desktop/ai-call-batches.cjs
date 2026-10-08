const { createHash } = require('node:crypto');

// Only consecutive ordinary edits share a transaction. Never advance a revision.
function callBatches(calls) {
    const eligible = call => call.name === 'director_apply' && call.args &&
        Object.keys(call.args).every(k => ['revision', 'requestId', 'operations'].includes(k)) &&
        Number.isFinite(call.args.revision) && typeof call.args.requestId === 'string' && call.args.requestId.length > 0 &&
        Array.isArray(call.args.operations) && call.args.operations.length > 0 &&
        !call.args.operations.some(op => op?.operation === 'lock');
    const groups = [];
    for (const call of calls) {
        const last = groups.at(-1);
        if (eligible(call) && last && last.every(eligible) && last[0].args.revision === call.args.revision &&
            !last.some(c => c.args.requestId === call.args.requestId) &&
            last.reduce((n, c) => n + c.args.operations.length, 0) + call.args.operations.length <= 100) last.push(call);
        else groups.push([call]);
    }
    return groups.map(calls => {
        if (calls.length === 1) return { calls, name: calls[0].name, args: calls[0].args };
        const requests = calls.map(c => c.args);
        return { calls, name: 'director_apply', args: { revision: requests[0].revision,
            requestId: 'batch-' + createHash('sha256').update(JSON.stringify(requests)).digest('hex'), requests } };
    });
}
module.exports = { callBatches };
