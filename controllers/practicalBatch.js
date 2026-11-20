const router=require('express').Router(),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const {Batch,Member}=require('../Models/practicalBatch');
const User=require('../Models/user'),Menu=require('../Models/menuaccessds'),Exam=require('../Models/conductexamds'),Program=require('../Models/mprograms'),Course=require('../Models/regulationcoursemapds'),Ledger=require('../Models/ledgerstud'),Roll=require('../Models/conductexamrollds');
const paths={master:'/conduct-exam-practical-batch',assign:'/conduct-exam-practical-batch-assign',timetable:'/conduct-exam-practical-batch-timetable',edit:'/conduct-exam-practical-batch-timetable-edit'};
const text=v=>typeof v==='string'?v.trim():'';
const escape=v=>text(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const exact=v=>new RegExp('^'+escape(v)+'$','i');
const transaction=async fn=>{const session=await mongoose.startSession();try{return await session.withTransaction(()=>fn(session));}finally{await session.endSession();}};
const auth=(pages,fn)=>async(req,res)=>{
 try{
  let identity;try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.status(401).json({message:'Sign in to continue'});}
  if(!Number(identity.colid)||!text(identity.user))return res.sendStatus(401);
  const a=await User.findOne({colid:Number(identity.colid),email:exact(identity.user)}).select('colid name email role').lean();
  if(!a||/^(Student|Agent|Publisher)$/i.test(a.role))return res.sendStatus(403);
  if(!/^all$/i.test(a.role)){
   let allowed=false;for(const page of [].concat(pages))if(await Menu.exists({colid:a.colid,role:a.role,path:paths[page],access:'Allow'})||await require('../services/additionalAccess').hasPage(a,paths[page])){allowed=true;break;}
   if(!allowed)return res.status(403).json({message:'Page access is required'});
  }
  await fn(req,res,a);
 }catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'This batch or student assignment already exists. Refresh the list.':e.message});}
};
const selectedIds=value=>{if(!Array.isArray(value)||!value.length||value.length>1000||value.some(id=>!mongoose.isValidObjectId(id)))throw Error('Select between 1 and 1000 records');return [...new Set(value.map(String))];};
const findBatch=async(colid,id,session)=>{
 if(!mongoose.isValidObjectId(id))throw Error('Select a practical batch');
 if(session)await Batch.updateOne({colid,_id:id},{$inc:{revision:1}},{session});
 const row=await Batch.findOne({colid,_id:id}).session(session||null).lean();if(!row)throw Error('Batch not found');return row;
};
const filterFields=['program','programcode','semester','regulation','feegroup','feecategory','feeitem','student','regno'];
function ledgerQuery(colid,batch,filters){
 const clauses=[];
 if(typeof filters==='string')filters=JSON.parse(filters||'[]');
 if(!Array.isArray(filters))throw Error('Invalid filters');
 for(const row of filters){if(!filterFields.includes(row.field))throw Error('Invalid filter field');const value=text(row.value);if(value)clauses.push({[row.field]:new RegExp(row.operator==='contains'?escape(value):'^'+escape(value)+'$','i')});}
 return {colid,academicyear:batch.academicyear,paid:{$gt:0},regno:{$nin:['',null]},...(clauses.length?{$and:clauses}:{})};
}
async function paidStudents(colid,batch,filters,regnos,session){
 const q=ledgerQuery(colid,batch,filters||[]);if(regnos)q.regno={$in:regnos};
 const rows=await Ledger.aggregate([{$match:q},{$sort:{_id:-1}},{$group:{_id:'$regno',student:{$first:'$student'},program:{$first:'$program'},programcode:{$first:'$programcode'},semester:{$first:'$semester'},regulation:{$first:'$regulation'},paid:{$sum:'$paid'},balance:{$sum:'$balance'},feeitems:{$addToSet:'$feeitem'}}}]).session(session||null);
 const users=await User.find({colid,role:/^Student$/i,regno:{$in:rows.map(row=>row._id)}}).select('name email regno rollno section').session(session||null).lean();
 const byRegno=new Map(users.map(row=>[row.regno,row]));
 return rows.filter(row=>byRegno.has(row._id)).map(row=>({...row,regno:row._id,student:byRegno.get(row._id).name||row.student,email:byRegno.get(row._id).email,rollno:byRegno.get(row._id).rollno,section:byRegno.get(row._id).section}));
}
router.get('/options',auth(['master','assign','timetable','edit'],async(req,res,a)=>{
 const year=text(req.query.academicyear),examcode=text(req.query.examcode);
 const [years,exams,batches,programs,courses]=await Promise.all([
  Exam.distinct('academicyear',{colid:a.colid}),year?Exam.find({colid:a.colid,academicyear:year}).select('examname examcode').sort({examname:1}).lean():[],
  year&&examcode?Batch.find({colid:a.colid,academicyear:year,examcode}).sort({batch:1}).lean():[],
  year?Program.find({colid:a.colid,year}).select('program programcode').sort({program:1}).lean():[],
  year&&req.query.programcode?Course.find({colid:a.colid,academicyear:year,programcode:text(req.query.programcode),coursetype:/^Practical$/i}).sort({course:1}).lean():[]
 ]);res.json({years:years.filter(Boolean),exams,batches,programs,courses});
}));
router.get('/batches',auth('master',async(req,res,a)=>res.json(await Batch.find({colid:a.colid,...(text(req.query.academicyear)?{academicyear:text(req.query.academicyear)}:{})}).sort({createdAt:-1}).lean())));
router.post('/batches',auth('master',async(req,res,a)=>{
 const b=req.body,exam=await Exam.findOne({colid:a.colid,academicyear:text(b.academicyear),examcode:text(b.examcode)}).lean();
 if(!exam||!text(b.batch)||text(b.batch).length>100)throw Error('Select an exam and enter a batch name (up to 100 characters)');
 const fields={academicyear:exam.academicyear,exam:exam.examname,examcode:exam.examcode,batch:text(b.batch),description:text(b.description).slice(0,5000),user:a.email};
 await transaction(async session=>{
  if(b.id){
   const previous=await findBatch(a.colid,b.id,session);
   const used=await Member.exists({colid:a.colid,batchid:previous._id}).session(session);
   if(used&&['academicyear','examcode','batch'].some(k=>fields[k]!==previous[k]))throw Error('A batch with assigned students cannot be renamed or moved to another exam');
   await Batch.updateOne({_id:previous._id,colid:a.colid},{$set:fields},{session,runValidators:true});
  }else await Batch.create([{...fields,colid:a.colid}],{session});
 });res.json({message:'Practical batch saved'});
}));
router.post('/batches/delete',auth('master',async(req,res,a)=>{
 const ids=selectedIds(req.body.ids);await transaction(async session=>{
  if(await Member.exists({colid:a.colid,batchid:{$in:ids}}).session(session))throw Error('Remove assigned students before deleting batches');
  await Batch.deleteMany({colid:a.colid,_id:{$in:ids}},{session});
 });res.json({message:'Batches deleted'});
}));
router.get('/fee-options',auth('assign',async(req,res,a)=>{
 const batch=await findBatch(a.colid,req.query.batchid);
 const options=Object.fromEntries(await Promise.all(filterFields.map(async field=>[field,(await Ledger.distinct(field,{colid:a.colid,academicyear:batch.academicyear,paid:{$gt:0}})).filter(Boolean).map(String).sort()])));
 options.programPairs=await Ledger.aggregate([{$match:{colid:a.colid,academicyear:batch.academicyear,paid:{$gt:0}}},{$group:{_id:{program:'$program',programcode:'$programcode'}}},{$project:{_id:0,program:'$_id.program',programcode:'$_id.programcode'}}]);res.json(options);
}));
router.get('/members',auth('assign',async(req,res,a)=>{
 const batch=await findBatch(a.colid,req.query.batchid);
 res.json(await Member.find({colid:a.colid,batchid:batch._id}).sort({student:1}).lean());
}));
router.post('/eligible',auth('assign',async(req,res,a)=>{
 const batch=await findBatch(a.colid,req.body.batchid);
 const [students,members]=await Promise.all([paidStudents(a.colid,batch,req.body.filters||[]),Member.find({colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode}).select('regno').lean()]);
 const assigned=new Set(members.map(row=>row.regno));res.json(students.filter(row=>!assigned.has(row.regno)));
}));
router.post('/members',auth('assign',async(req,res,a)=>{
 const regnos=Array.isArray(req.body.regnos)?[...new Set(req.body.regnos.map(text).filter(Boolean))]:[];
 if(!regnos.length||regnos.length>1000)throw Error('Select between 1 and 1000 students');
 await transaction(async session=>{
  const batch=await findBatch(a.colid,req.body.batchid,session);
  const students=await paidStudents(a.colid,batch,req.body.filters||[],regnos,session);
  if(students.length!==regnos.length)throw Error('Some students no longer match the filters or have no recorded fee payment');
  if(await Member.exists({colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode,regno:{$in:regnos}}).session(session))throw Error('A selected student is already assigned to a batch for this exam');
  await Member.insertMany(students.map(row=>({colid:a.colid,batchid:batch._id,academicyear:batch.academicyear,examcode:batch.examcode,regno:row.regno,student:row.student,email:row.email,program:row.program,programcode:row.programcode,semester:row.semester,regulation:row.regulation,user:a.email})),{session});
 });res.json({message:`Added ${regnos.length} students to the batch`});
}));
router.post('/members/delete',auth('assign',async(req,res,a)=>{
 const ids=selectedIds(req.body.ids);await transaction(async session=>{
  const batch=await findBatch(a.colid,req.body.batchid,session);
  const members=await Member.find({_id:{$in:ids},colid:a.colid,batchid:batch._id}).session(session).lean();
  if(members.length!==ids.length)throw Error('Selected students no longer belong to this batch');
  await Roll.updateMany({colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode,practicalbatchid:String(batch._id),regno:{$in:members.map(row=>row.regno)}},{$set:{practicalbatchid:'',batch:'',examdate:'',examslot:''}},{session});
  await Member.deleteMany({_id:{$in:ids},colid:a.colid,batchid:batch._id},{session});
 });res.json({message:'Students removed and their practical batch timetable cleared'});
}));
function dateSlot(body){const date=text(body.examdate),slot=text(body.examslot);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!slot||slot.length>150)throw Error('Enter a valid exam date and exam slot');return {examdate:date,examslot:slot};}
router.post('/timetable',auth(['timetable','edit'],async(req,res,a)=>{
 const dates=dateSlot(req.body);let updated=0;
 await transaction(async session=>{
  const batch=await findBatch(a.colid,req.body.batchid,session);
  if(batch.academicyear!==text(req.body.academicyear)||batch.examcode!==text(req.body.examcode))throw Error('Batch does not match the selected year and exam');
  const course=await Course.findOne({colid:a.colid,_id:req.body.courseid,academicyear:batch.academicyear,programcode:text(req.body.programcode),coursetype:/^Practical$/i}).session(session).lean();
  if(!course)throw Error('Select a matching Practical course from regulation course map');
  const members=await Member.find({colid:a.colid,batchid:batch._id}).select('regno').session(session).lean();
  if(!members.length)throw Error('Add students to the batch first');
  const match={colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode,exam:batch.exam,program:course.program,programcode:course.programcode,regulation:course.regulation,semester:course.semester,course:course.course,coursecode:course.coursecode,regno:{$in:members.map(row=>row.regno)}};
  const result=await Roll.updateMany(match,{$set:{...dates,batch:batch.batch,practicalbatchid:String(batch._id)}},{session,runValidators:true});
  if(!result.matchedCount)throw Error('No matching examroll entries found for the batch members and selected Practical course');updated=result.matchedCount;
 });res.json({message:`Updated ${updated} matching examroll entries`,updated});
}));
router.get('/timetable',auth(['timetable','edit'],async(req,res,a)=>{
 const batch=await findBatch(a.colid,req.query.batchid);
 if(batch.academicyear!==text(req.query.academicyear)||batch.examcode!==text(req.query.examcode))throw Error('Batch does not match the selected year and exam');
 const rows=await Roll.aggregate([{$match:{colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode,practicalbatchid:String(batch._id),examdate:{$nin:['',null]}}},{$group:{_id:{program:'$program',programcode:'$programcode',regulation:'$regulation',semester:'$semester',course:'$course',coursecode:'$coursecode',examdate:'$examdate',examslot:'$examslot'},students:{$sum:1}}},{$sort:{'_id.examdate':1,'_id.course':1}}]);
 const courses=await Course.find({colid:a.colid,academicyear:batch.academicyear,coursetype:/^Practical$/i,coursecode:{$in:rows.map(row=>row._id.coursecode)}}).select('programcode regulation semester coursecode').lean();
 res.json(rows.map(row=>({...row._id,_id:JSON.stringify(row._id),students:row.students,courseid:courses.find(course=>['programcode','regulation','semester','coursecode'].every(field=>String(course[field])===String(row._id[field])))?._id})));
}));
router.post('/timetable/delete',auth(['timetable','edit'],async(req,res,a)=>{
 const courseids=selectedIds(req.body.courseids);let cleared=0;
 await transaction(async session=>{
  const batch=await findBatch(a.colid,req.body.batchid,session);
  const courses=await Course.find({_id:{$in:courseids},colid:a.colid,academicyear:batch.academicyear,coursetype:/^Practical$/i}).session(session).lean();
  if(courses.length!==courseids.length)throw Error('Select valid Practical courses');
  const result=await Roll.updateMany({colid:a.colid,academicyear:batch.academicyear,examcode:batch.examcode,practicalbatchid:String(batch._id),$or:courses.map(course=>({programcode:course.programcode,regulation:course.regulation,semester:course.semester,coursecode:course.coursecode}))},{$set:{examdate:'',examslot:''}},{session});cleared=result.matchedCount;
 });res.json({message:`Cleared timetable for ${cleared} examroll entries`});
}));
module.exports=router;
