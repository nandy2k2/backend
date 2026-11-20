const test=require('node:test'),assert=require('node:assert/strict');
const {paymentStatus}=require('../services/examRollPayments');
test('course payment status is independent of fees eligibility',()=>{
 assert.equal(paymentStatus([],false),'Unlinked');
 assert.equal(paymentStatus([],true),'Waived');
 assert.equal(paymentStatus([{paid:0,balance:100}],false),'Unpaid');
 assert.equal(paymentStatus([{paid:30,balance:70}],false),'Partially Paid');
 assert.equal(paymentStatus([{paid:100,balance:0}],false),'Paid');
 assert.equal(paymentStatus([{paid:0,balance:0}],false),'Waived');
 assert.equal(paymentStatus([{paid:100,balance:null}],false),'Partially Paid');
});
