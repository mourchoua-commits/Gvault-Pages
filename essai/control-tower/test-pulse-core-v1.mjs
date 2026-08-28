import assert from 'node:assert/strict';
import {computePulse} from './pulse-core-v1.mjs';

let s={};
s=computePulse(s,{totalEvents:10,headSha:'a'});
assert.equal(s.mode,'MICRO');
assert.equal(s.sampleSize,4);

s=computePulse(s,{totalEvents:10,headSha:'a'});
assert.equal(s.mode,'MICRO');
assert.equal(s.difference.residualScore,0);

s=computePulse(s,{totalEvents:11,headSha:'b'});
assert.equal(s.mode,'WIDE');
assert.equal(s.sampleSize,12);
assert.ok(s.difference.residualScore>=2);

s=computePulse(s,{totalEvents:11,headSha:'b'});
assert.equal(s.mode,'MICRO');

s=computePulse(s,{totalEvents:30,headSha:'c'});
assert.equal(s.mode,'FULL_SYNC_RECOMMENDED');
assert.equal(s.sampleSize,48);
assert.ok(s.difference.residualScore>=6);

console.log('PULSE CORE V1 · 5/5 PASS');
