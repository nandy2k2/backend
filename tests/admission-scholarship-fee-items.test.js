const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const router=require('../controllers/admissionscholarshipctlrds');
const Model=require('../Models/admissionscholarshipds');
const Program=require('../Models/mprograms');
const Fees=require('../Models/fees');
const mongoose=require('mongoose');
const original=[Program.findOne,Fees.findOne,Fees.find,Model.insertMany,Model.find,Model.findOneAndUpdate,mongoose.startSession];
afterEach(()=>{[Program.findOne,Fees.findOne,Fees.find,Model.insertMany,Model.find,Model.findOneAndUpdate,mongoose.startSession]=original;});
const q=data=>({select(){return this;},sort(){return this;},limit(){return this;},lean:async()=>data});
async function invoke(method,path,body={},query={}){const layer=router.stack.find(row=>row.route?.path===path&&row.route.methods[method]);const res={code:200,status(code){this.code=code;return this;},json(data){this.data=data;}};await layer.route.stack.at(-1).handle({user:{colid:42},body,query},res);return res;}
const row={scholarship:'Merit',academicyear:'2026-27',programcode:'P1',semester:'1',feecategory:'General',feeitem:'Tuition',type:'Percentage',value:10};
test('editing multiple combinations updates original and inserts remaining rows in one scoped transaction',async()=>{
  Program.findOne=()=>q({program:'Science',programcode:'P1'});
  Fees.findOne=()=>q({_id:'fee1',semester:'1',feecategory:'General',feeeitem:'Tuition'});
  let ended=false,updated=false,inserted=false;
  const session={withTransaction:async callback=>callback(),endSession:async()=>{ended=true;}};
  mongoose.startSession=async()=>session;
  Model.findOneAndUpdate=async(filter,update,options)=>{assert.equal(filter.colid,42);assert.equal(options.session,session);assert.equal(update.$set.category,'SC');updated=true;return {};};
  Model.insertMany=async(rows,options)=>{assert.equal(options.session,session);assert.equal(rows.length,1);assert.equal(rows[0].category,'ST');assert.equal(rows[0].colid,42);inserted=true;};
  const res=await invoke('post','/save',{id:'012345678901234567890123',rows:[{...row,category:'SC'},{...row,category:'ST'}]});
  assert.equal(res.code,200);assert.equal(res.data.saved,2);assert.ok(ended&&updated&&inserted);
});
test('semester and fee item must come from scoped year/program Fees configuration',async()=>{
  Program.findOne=match=>{assert.equal(match.colid,42);assert.equal(match.year,'2026-27');return q({program:'Science',programcode:'P1'});};
  Fees.findOne=match=>{assert.equal(match.colid,42);assert.equal(match.semester,'1');assert.equal(match.feeeitem,'Tuition');return q({_id:'fee1',semester:'1',feecategory:'General',feeeitem:'Tuition'});};
  Model.insertMany=async rows=>{assert.equal(rows[0].colid,42);assert.equal(rows[0].feeconfigurationid,'fee1');assert.equal(rows[0].feeitem,'Tuition');assert.equal(rows[0].semester,'1');};
  assert.equal((await invoke('post','/save',{colid:99,rows:[row]})).code,200);
  Fees.findOne=()=>q(null);assert.equal((await invoke('post','/save',{rows:[row]})).code,400);
});
test('new bulk rows cannot omit semester and fee details',async()=>{
  Program.findOne=()=>q({program:'Science',programcode:'P1'});
  const result=await invoke('post','/save',{rows:[{...row,semester:'',feeitem:'',feecategory:''}]});assert.equal(result.code,400);assert.match(result.data.message,/semester/);
});
test('fee options are institution scoped and require academic year and program',async()=>{
  Fees.find=match=>{assert.deepEqual(match,{colid:42,academicyear:'2026-27',programcode:'P1',semester:'1'});return q([{feeeitem:'Tuition'}]);};
  const result=await invoke('get','/fee-options',{}, {colid:99,academicyear:'2026-27',programcode:'P1',semester:'1'});assert.equal(result.data.data[0].feeeitem,'Tuition');
  const empty=await invoke('get','/fee-options',{},{});assert.deepEqual(empty.data.data,[]);
});
test('scholarshiptype is saved for single/bulk rows, defaults for old uploads, and rejects unknown values',async()=>{
  Program.findOne=()=>q({program:'Science',programcode:'P1'});
  Fees.findOne=()=>q({_id:'fee1',semester:'1',feecategory:'General',feeeitem:'Tuition'});
  const written=[];Model.insertMany=async rows=>written.push(...rows);
  for(const scholarshiptype of ['Total','Balance','Paid',undefined,'']){
    const res=await invoke('post','/save',{rows:[{...row,scholarshiptype}]});assert.equal(res.code,200);
    assert.equal(written.at(-1).scholarshiptype,scholarshiptype || 'Total');
  }
  const invalid=await invoke('post','/save',{rows:[{...row,scholarshiptype:'Other'}]});assert.equal(invalid.code,400);assert.match(invalid.data.message,/Invalid scholarship type/);
});
test('legacy records without scholarshiptype return Total while existing choices remain unchanged',async()=>{
  Model.find=match=>{assert.equal(match.colid,42);return q([{scholarship:'Old'},{scholarship:'Paid rule',scholarshiptype:'Paid'}]);};
  const res=await invoke('get','/',{},{});assert.equal(res.data.data[0].scholarshiptype,'Total');assert.equal(res.data.data[1].scholarshiptype,'Paid');
});
