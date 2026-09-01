import assert from 'node:assert/strict';
import {decideDestination,GTHINK_DESTINIES} from './gthink-policy-v1.mjs';

const wall=decideDestination({action:'adapt-presentation',targetRole:'wall',touchesWall:true});
assert.equal(wall.decision,'DENY');
assert.equal(wall.destiny,GTHINK_DESTINIES.FIXED_STRUCTURE);

const sas=decideDestination({action:'decorate',targetRole:'sas',touchesSas:true});
assert.equal(sas.decision,'DENY');
assert.equal(sas.destiny,GTHINK_DESTINIES.FIXED_STRUCTURE);

const blob=decideDestination({action:'adapt-presentation',targetRole:'blob-zone',confidence:1});
assert.equal(blob.decision,'ALLOW');
assert.equal(blob.destiny,GTHINK_DESTINIES.ADAPTIVE_BLOB);

const self=decideDestination({action:'refresh',targetRole:'blob-zone'});
assert.equal(self.decision,'ALLOW');
assert.equal(self.destiny,GTHINK_DESTINIES.SELF_MAINTAIN);

const unclear=decideDestination({action:'unknown-action',targetRole:'blob-zone'});
assert.equal(unclear.decision,'CLARIFY');
assert.equal(unclear.destiny,GTHINK_DESTINIES.GTHINK_PENDING);

console.log('gthink-policy-v1 PASS');
