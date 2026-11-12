import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewInteraction} from '../src/editor/view-interaction.ts';

test('view interaction spans dragging, wheel gestures and damping without activating programmatic changes',()=>{
    const input=new ViewInteraction();
    input.changed(0);assert.equal(input.active(0),false);
    input.start();assert.equal(input.active(1000),true);
    input.end(1000);assert.equal(input.active(1100),true);
    input.changed(1100);assert.equal(input.active(1200),true);
    assert.equal(input.active(1251),false);
    input.changed(1300);assert.equal(input.active(1300),false);
    input.touch(1400);assert.equal(input.active(1450),true);
    input.clear();assert.equal(input.active(1450),false);
    input.start();input.end(1500);assert.equal(input.active(1501),true);
    assert.equal(input.active(1651),false);
});
