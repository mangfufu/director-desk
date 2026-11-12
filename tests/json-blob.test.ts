import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonBlob } from '../src/files/json-blob.ts';

test('chunked project JSON preserves Unicode, escaped characters and JSON values across chunk boundaries', async () => {
    const string = 'a'.repeat(65535) + '😀' + '\ud800' + '\udc00' + '\ud800x\udc00\n\r\t"\\中文';
    const data = { name: '带贴图工程', resources: [{ data: string.repeat(6) }], omitted: undefined, array: [undefined, NaN, Infinity, -0, true, null], shared: { x: 2 } };
    const blob = jsonBlob(data);
    assert.equal(blob.type, 'application/json');
    assert.equal(await blob.text(), JSON.stringify(data));
    assert.deepEqual(JSON.parse(await blob.text()), JSON.parse(JSON.stringify(data)));
    const cycle: any = {}; cycle.self = cycle;
    assert.throws(() => jsonBlob(cycle), /Circular/);
});
