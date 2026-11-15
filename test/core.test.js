import test from 'node:test';
import assert from 'node:assert/strict';
import {authorize,settings,uuid,text,hash,same} from '../server/core.js';
test('patient cannot cross session boundary or review clinical drafts',()=>{assert.throws(()=>authorize({role:'patient',session_id:'a'},'b'),{status:403});assert.throws(()=>authorize({role:'patient',session_id:'a'},'a',true),{status:403});assert.doesNotThrow(()=>authorize({role:'patient',session_id:'a'},'a'));});
test('invalid preferences and malformed identifiers are rejected',()=>{assert.throws(()=>settings({mode:'scan',dwellMs:5}),{status:400});assert.throws(()=>settings({mode:'camera',dwellMs:1000}),{status:400});assert.throws(()=>uuid('1 OR 1=1'),{status:400});assert.throws(()=>text(' '),{status:400});assert.equal(settings({mode:'dwell',dwellMs:1600,speak:true}).dwellMs,1600);});
test('tokens are hashed and credentials use fixed-size comparisons',()=>{assert.equal(hash('test').length,64);assert.equal(same('abc','abc'),true);assert.equal(same('abc','abcd'),false);});
