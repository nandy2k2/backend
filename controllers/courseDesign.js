const router=require('express').Router(),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const {Assignment,Workflow,Submission}=require('../Models/courseDesign');
const User=require('../Models/user'),Menu=require('../Models/menuaccessds'),Notification=require('../Models/userinboxnotification');
const Course=require('../Models/regulationcoursemapds'),Syllabus=require('../Models/syllabusds'),Program=require('../Models/mprograms'),Regulation=require('../Models/regulationmasterds');
const paths={assignments:'/workload-design',workflow:'/course-design-workflow',content:'/course-design',review:'/course-design-approvals'};
const text=v=>typeof v==='string'?v.trim():'';
const exact=v=>new RegExp('^'+text(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
const ids=v=>{if(!Array.isArray(v)||!v.length||v.length>500||v.some(id=>!mongoose.isValidObjectId(id)))throw Error('Select between 1 and 500 valid records');return [...new Set(v.map(String))];};
const auth=(page,fn)=>async(req,res)=>{
 try{
  let identity;try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.status(401).json({message:'Sign in to continue'});}
  if(!identity.user||!Number(identity.colid))return res.sendStatus(401);
  const actor=await User.findOne({colid:Number(identity.colid),email:exact(identity.user)}).select('name email role colid').lean();
  if(!actor||/^student$/i.test(actor.role))return res.sendStatus(403);
  const pages=Array.isArray(page)?page:[page];
  if(!/^all$/i.test(actor.role)){
   let allowed=false;
   for(const p of pages)if(await Menu.exists({colid:actor.colid,role:actor.role,path:paths[p],access:'Allow'})||await require('../services/additionalAccess').hasPage(actor,paths[p])){allowed=true;break;}
   if(!allowed)return res.status(403).json({message:'Page access is required'});
  }
  await fn(req,res,actor);
 }catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'This record already exists; refresh and try again':e.message});}
};
const transaction=async fn=>{const session=await mongoose.startSession();try{return await session.withTransaction(()=>fn(session));}finally{await session.endSession();}};
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function checkDates(start,end){if(!validDate(start)||!validDate(end)||start>end)throw Error('Enter valid start and end dates, with end date on or after start date');}
function documentFields(body){
 const title=text(body.title),content=text(body.content);
 if(title.length>250||content.length>200000)throw Error('Title or content is too long');
 if(!Array.isArray(body.documents)||body.documents.length>100)throw Error('Add up to 100 documents');
 const documents=body.documents.map(item=>{const url=new URL(text(item.url));if(!['http:','https:'].includes(url.protocol))throw Error('Use HTTP or HTTPS document links');return {name:text(item.name).slice(0,250)||'Document',url:url.href};});
 return {title,content,documents};
}
const notify=(session,colid,recipient,title,message,link)=>Notification.create([{colid,recipient,title,text:message,link}],{session});
router.get('/options',auth('assignments',async(req,res,a)=>{
 const q={colid:a.colid};
 for(const field of ['academicyear','regulation','programcode','type','subject','semester'])if(text(req.query[field]))q[field]=text(req.query[field]);
 const subjectQuery={...q},semesterQuery={...q};delete subjectQuery.subject;delete subjectQuery.semester;delete semesterQuery.semester;
 const [years,regulations,programs,types,subjects,semesters,courses,syllabus]=await Promise.all([
  Course.distinct('academicyear',{colid:a.colid}),Regulation.find({colid:a.colid}).select('regulation').lean(),
  Program.find({colid:a.colid,...(q.academicyear?{year:q.academicyear}:{})}).select('program programcode year').lean(),
  Course.distinct('type',{colid:a.colid}),Course.distinct('subject',subjectQuery),Course.distinct('semester',semesterQuery),
  q.academicyear&&q.regulation&&q.programcode?Course.find(q).sort({course:1}).lean():[],
  q.academicyear&&q.regulation&&q.programcode?Syllabus.find(q).select('coursecode module').lean():[]
 ]);
 res.json({years,regulations:regulations.map(row=>row.regulation).filter(Boolean),programs,types,subjects,semesters,courses,syllabus});
}));
router.get('/users',auth(['assignments','workflow'],async(req,res,a)=>{
 const search=new RegExp(text(req.query.search).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
 res.json(await User.find({colid:a.colid,role:{$not:/^student$/i},$or:[{name:search},{email:search}]}).select('name email department').sort({name:1}).limit(50).lean());
}));
router.get('/assignments',auth('assignments',async(req,res,a)=>res.json(await Assignment.find({colid:a.colid}).sort({createdAt:-1}).lean())));
router.post('/assignments',auth('assignments',async(req,res,a)=>{
 const b=req.body;checkDates(b.startdate,b.enddate);
 if(!mongoose.isValidObjectId(b.facultyid))throw Error('Select a faculty member');
 const faculty=await User.findOne({_id:b.facultyid,colid:a.colid,role:{$not:/^student$/i}}).select('name email department').lean();
 if(!faculty?.email)throw Error('Select a valid faculty member');
 const courseids=ids(b.courseids),courses=await Course.find({_id:{$in:courseids},colid:a.colid}).lean();
 if(courses.length!==courseids.length)throw Error('Select courses from regulation course map');
 if(b.id&&courses.length!==1)throw Error('Edit one assignment at a time');
 const modules=Array.isArray(b.modules)?[...new Set(b.modules.map(text).filter(Boolean))]:[];
 const hours=Number(b.hoursperweek||0);if(!Number.isFinite(hours)||hours<0)throw Error('Enter valid hours per week');
 await transaction(async session=>{
  for(const course of courses){
   const allowed=await Syllabus.distinct('module',{colid:a.colid,academicyear:course.academicyear,regulation:course.regulation,programcode:course.programcode,semester:course.semester,coursecode:course.coursecode}).session(session);
   if(modules.some(module=>!allowed.includes(module)))throw Error('Selected modules must belong to each selected course');
   const fields=Object.fromEntries(['academicyear','regulation','program','programcode','type','subject','semester','course','coursecode','coursetype'].map(key=>[key,course[key]||'']));
   Object.assign(fields,{coursemapid:String(course._id),facultyid:String(faculty._id),colid:a.colid,user:a.email,facultyname:faculty.name,facultyemail:faculty.email,facultydepartment:faculty.department,modules,module:modules.join(', '),hoursperweek:hours,startdate:b.startdate,enddate:b.enddate,status:'Active'});
   let row;
   if(b.id){
    if(await Submission.exists({colid:a.colid,assignmentid:b.id,status:{$in:['Submitted','Approved']}}).session(session))throw Error('Submitted or approved assignments cannot be changed');
    const previous=await Assignment.findOne({_id:b.id,colid:a.colid}).session(session);
    if(!previous)throw Error('Assignment not found');
    if(await Submission.exists({colid:a.colid,assignmentid:b.id}).session(session)&&['facultyemail','academicyear','regulation','programcode','semester','coursecode'].some(k=>previous[k]!==fields[k]))throw Error('A saved design exists; create a new assignment to change faculty or course');
    row=await Assignment.findOneAndUpdate({_id:b.id,colid:a.colid},{$set:fields},{new:true,runValidators:true,session});
   }else [row]=await Assignment.create([fields],{session});
   await notify(session,a.colid,faculty.email,'Course design assigned',`${course.course} (${course.coursecode}) assigned from ${b.startdate} to ${b.enddate}.`,paths.content);
  }
 });res.json({message:'Workload design saved and faculty notified'});
}));
router.post('/assignments/delete',auth('assignments',async(req,res,a)=>{
 const selected=ids(req.body.ids);
 await transaction(async session=>{
  if(await Submission.exists({colid:a.colid,assignmentid:{$in:selected}}).session(session))throw Error('Assignments with saved designs cannot be deleted');
  await Assignment.deleteMany({colid:a.colid,_id:{$in:selected}},{session});
 });res.json({message:'Assignments deleted'});
}));
router.get('/workflow',auth('workflow',async(req,res,a)=>res.json((await Workflow.findOne({colid:a.colid}).lean())?.approvers||[])));
router.post('/workflow',auth('workflow',async(req,res,a)=>{
 const selected=ids(req.body.ids);if(selected.length>20)throw Error('Use up to 20 approval levels');
 const users=await User.find({colid:a.colid,_id:{$in:selected},role:{$not:/^student$/i}}).select('name email').lean();
 if(users.length!==selected.length||users.some(row=>!row.email))throw Error('Select valid staff approvers');
 const approvers=selected.map(id=>{const row=users.find(u=>String(u._id)===id);return {userid:id,name:row.name,email:row.email};});
 await Workflow.findOneAndUpdate({colid:a.colid},{$set:{approvers}},{upsert:true});res.json({message:'Approval workflow saved'});
}));
router.get('/mine',auth('content',async(req,res,a)=>{
 const assignments=await Assignment.find({colid:a.colid,facultyemail:exact(a.email),status:'Active'}).sort({createdAt:-1}).lean();
 const submissions=await Submission.find({colid:a.colid,owner:exact(a.email),assignmentid:{$in:assignments.map(row=>row._id)}}).lean();
 res.json(assignments.map(row=>({...row,submission:submissions.find(s=>String(s.assignmentid)===String(row._id))||null})));
}));
router.post('/design/:id',auth('content',async(req,res,a)=>{
 const fields=documentFields(req.body),submit=req.body.submit===true;
 if(submit&&(!fields.title||(!fields.content&&!fields.documents.length)))throw Error('Enter a title and content or upload documents');
 await transaction(async session=>{
  const assignment=await Assignment.findOne({_id:req.params.id,colid:a.colid,facultyemail:exact(a.email),status:'Active'}).session(session);
  if(!assignment)throw Error('This course is not assigned to you');
  const existing=await Submission.findOne({colid:a.colid,assignmentid:assignment._id}).session(session);
  if(existing&&!['Draft','Rejected'].includes(existing.status))throw Error('Submitted or approved designs are locked');
  const row=existing||new Submission({colid:a.colid,assignmentid:assignment._id,owner:a.email});
  Object.assign(row,fields,{status:'Draft'});
  if(submit){
   const flow=await Workflow.findOne({colid:a.colid}).session(session);
   if(!flow?.approvers.length)throw Error('Ask the administrator to configure the course design approval workflow');
   row.approvers=flow.approvers.map(p=>({userid:p.userid,name:p.name,email:p.email}));row.step=0;row.status='Submitted';row.submittedat=new Date();
   row.history.push({decision:'Submitted',by:a.email,date:new Date()});
   await notify(session,a.colid,row.approvers[0].email,'Course design awaiting approval',`${a.name} submitted ${row.title} for ${assignment.course}.`,paths.review);
  }
  await row.save({session});
 });res.json({message:submit?'Course design submitted for approval':'Draft saved'});
}));
router.post('/designs/delete',auth('content',async(req,res,a)=>{
 const selected=ids(req.body.ids);
 await transaction(async session=>{
  const query={colid:a.colid,owner:exact(a.email),_id:{$in:selected},status:{$in:['Draft','Rejected']}};
  if(await Submission.countDocuments(query).session(session)!==selected.length)throw Error('Select only your draft or rejected designs');
  await Submission.deleteMany(query,{session});
 });res.json({message:'Draft designs deleted'});
}));
router.get('/reviews',auth('review',async(req,res,a)=>{
 const rows=await Submission.find({colid:a.colid,'approvers.email':exact(a.email)}).sort({updatedAt:-1}).lean();
 const assignments=await Assignment.find({colid:a.colid,_id:{$in:rows.map(row=>row.assignmentid)}}).lean();
 res.json(rows.map(row=>({...row,assignment:assignments.find(item=>String(item._id)===String(row.assignmentid)),canapprove:row.status==='Submitted'&&exact(a.email).test(row.approvers[row.step]?.email||'')})));
}));
router.post('/decision/:id',auth('review',async(req,res,a)=>{
 const decision=req.body.decision,remarks=text(req.body.remarks);
 if(!['Approved','Rejected'].includes(decision)||(decision==='Rejected'&&!remarks))throw Error('Enter a reason for rejection');
 await transaction(async session=>{
  const row=await Submission.findOne({_id:req.params.id,colid:a.colid,status:'Submitted'}).session(session);
  if(!row||!exact(a.email).test(row.approvers[row.step]?.email||''))throw Error('This approval level is not assigned to you');
  row.history.push({level:row.step+1,decision,remarks,by:a.email,date:new Date()});
  if(decision==='Rejected')row.status='Rejected';
  else if(row.step+1===row.approvers.length){row.status='Approved';row.approvedat=new Date();}
  else row.step++;
  await row.save({session});
  if(row.status==='Submitted')await notify(session,a.colid,row.approvers[row.step].email,'Course design awaiting approval',row.title,paths.review);
  else await notify(session,a.colid,row.owner,`Course design ${row.status.toLowerCase()}`,`${row.title}${remarks?': '+remarks:''}`,paths.content);
 });res.json({message:'Approval decision recorded'});
}));
const upload=require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:20*1024*1024}}).single('file');
router.post('/upload',auth('content',async(req,res,a)=>{
 await new Promise((resolve,reject)=>upload(req,res,e=>e?reject(e):resolve()));
 const file=req.file;
 if(!file||!['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(file.mimetype))throw Error('Upload a PDF, Word, PowerPoint, PNG or JPG document (up to 20 MB)');
 const cfg=await require('../Models/awsconfig').findOne({colid:a.colid,type:/^aws$/i,default:/^yes$/i}).lean();
 if(!cfg?.bucket||!cfg.username||!cfg.password||!cfg.region)throw Error('Default AWS configuration is required');
 const key=a.colid+'/course-design/'+require('crypto').randomBytes(20).toString('hex')+require('path').extname(file.originalname).replace(/[^.a-z0-9]/gi,'');
 await new(require('aws-sdk').S3)({region:cfg.region,accessKeyId:cfg.username,secretAccessKey:cfg.password}).putObject({Bucket:cfg.bucket,Key:key,Body:file.buffer,ContentType:file.mimetype}).promise();
 res.json({name:file.originalname,url:`https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key}`});
}));
module.exports=router;
