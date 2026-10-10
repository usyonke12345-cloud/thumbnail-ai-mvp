import test from 'node:test';
import assert from 'node:assert/strict';
import {orderAssessments} from '../backend/assessment-order.mjs';
const candidate=(id,overall,unevaluated)=>({id,assessment:{overall,unevaluated}});
test('equal coverage with different missing items is not mixed; each group keeps stable ties',()=>{
 const rows=[candidate('fit-low',20,['fit']),candidate('font-high',99,['font']),candidate('fit-high',80,['fit']),candidate('fit-tie',80,['fit']),candidate('all',50,[])];
 assert.deepEqual(orderAssessments(rows).map(c=>c.id),['fit-high','fit-tie','fit-low','font-high','all']);
});
test('missing-item order does not create another group and legacy scores retain sorting',()=>{
 assert.deepEqual(orderAssessments([candidate('first',20,['fit','contrast']),candidate('second',40,['contrast','fit'])]).map(c=>c.id),['second','first']);
 assert.deepEqual(orderAssessments([candidate('a',30),candidate('b',80)]).map(c=>c.id),['b','a']);
});
