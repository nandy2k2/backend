const router=require('express').Router(),jwt=require('jsonwebtoken');
const User=require('../Models/user'),Program=require('../Models/mprograms'),Institution=require('../Models/academicmasterinstitutionds');
const text=v=>typeof v==='string'?v.trim():'';
const exact=v=>new RegExp('^'+text(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
const wrap=fn=>async(req,res)=>{
 let identity;try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
 try{
 const actor=await User.findOne({colid:Number(identity.colid),email:identity.user}).select('role colid').lean();
 if(!actor||/^student$/i.test(actor.role))return res.sendStatus(403);
 if(!/^(all|admin)$/i.test(actor.role)&&!await require('../Models/menuaccessds').exists({colid:actor.colid,role:actor.role,path:'/institution-dashboard',access:'Allow'})&&!await require('../services/additionalAccess').hasPage(actor,'/institution-dashboard'))return res.sendStatus(403);
 await fn(req,res,actor);
 }catch(e){res.status(400).json({message:e.message});}
};
router.get('/options',wrap(async(req,res,a)=>res.json(await Institution.find({colid:a.colid}).select('institution institutioncode').sort({institution:1}).lean())));
async function selected(req,colid){
 const row=await Institution.findOne({colid,_id:req.query.institutionid}).select('institution').lean();
 if(!row)throw Error('Select an institution from Institution Master');
 return row.institution;
}
router.get('/overview',wrap(async(req,res,a)=>{
 const institution=await selected(req,a.colid),scope={colid:a.colid,institution:exact(institution)};
 const [users,programs]=await Promise.all([
 User.find(scope).select('name email role institution department designation academicyear program programcode semester section gender category').sort({name:1}).lean(),
 Program.find(scope).select('program programcode year department faculty intakecapacity totalcredits semestertype noofsemesters').sort({program:1}).lean()
 ]);
 res.json({users,programs});
}));
const get=(model,query,projection)=>require('../Models/'+model).find(query).select(projection).lean();
router.get('/faculty',wrap(async(req,res,a)=>{
 const institution=await selected(req,a.colid);
 const person=await User.findOne({_id:req.query.userid,colid:a.colid,institution:exact(institution),role:{$not:/^student$/i}}).select('name email empid').lean();
 if(!person?.email)throw Error('Faculty does not belong to this institution');
 const colid=a.colid,email=exact(person.email),owned={colid,user:email},faculty={colid,facultyemail:email};
 const feedbackModel=require('mongoose').models.facultyfeedbackscorev2;
 const jobs={
 'Workload':()=>get('workloadassignmentds',faculty,'academicyear program course coursecode semester section hoursperweek'),
 'Classes scheduled':()=>get('neplmstimetableds',faculty,'academicyear course coursecode semester section classdate classtime onlineclassstatus status'),
 'Assignments and course materials':()=>get('neplmsresourceds',faculty,'resourcetype title academicyear course coursecode semester fullmarks status'),
 'Projects':()=>get('projects',owned,'project agency yop funds status1'),
 'Publications':()=>get('publications',owned,'title journal yop citation'),
 'Seminars':()=>get('seminar',owned,'title type duration yop amount role'),
 'Books':()=>get('book',owned,'title booktitle publisher yop isbn'),
 'Approved leave':()=>get('hrleaveapplicationds',{colid,employeeemail:email,status:/^approved$/i},'leavetype fromdate todate noofdays status'),
 'Leave balance':()=>get('hrleavebalanceds',{colid,employeeemail:email},'cyclename leavetype openingbalance carryforward earned used balance status'),
 'Salary structure':()=>get('hrsalstructure',{colid,empid:{$in:[person.email,person.empid].filter(Boolean)},level:{$ne:'Archived'}},'structure component amount type level effectivedate'),
 'Classwise attendance':async()=>require('../Models/neplmsattendanceds').aggregate([{$match:faculty},{$group:{_id:{classid:'$classid',date:'$classdate',time:'$classtime',course:'$course',code:'$coursecode',section:'$section'},students:{$sum:1},present:{$sum:'$attendance'}}},{$sort:{'_id.date':-1}}]).then(rows=>rows.map((row,index)=>({_id:String(index),...row._id,students:row.students,present:row.present,percentage:Math.round(row.present/row.students*10000)/100}))),
 'Feedback scores':async()=>feedbackModel?feedbackModel.aggregate([{$match:faculty},{$unwind:'$answers'},{$group:{_id:{course:'$course',code:'$coursecode',section:'$answers.section'},score:{$sum:{$ifNull:['$answers.score',0]}},max:{$sum:{$cond:[{$ne:[{$ifNull:['$answers.score',null]},null]},'$answers.max',0]}},pending:{$sum:{$cond:[{$eq:[{$ifNull:['$answers.score',null]},null]},1,0]}}}}]).then(rows=>rows.map((row,i)=>({_id:String(i),...row._id,score:row.score,max:row.max,pending:row.pending,percentage:row.max?Math.round(row.score/row.max*10000)/100:null}))):[]
 };
 const results=await Promise.all(Object.entries(jobs).map(async([title,load])=>{try{return [title,{rows:await load()}];}catch{return [title,{rows:[],error:'Unable to load this section'}];}}));
 res.json({person,sections:Object.fromEntries(results)});
}));
router.get('/program',wrap(async(req,res,a)=>{
 const institution=await selected(req,a.colid),program=await Program.findOne({_id:req.query.programid,colid:a.colid,institution:exact(institution)}).select('program programcode year').lean();
 if(!program)throw Error('Program not found in this institution');
 const scope={colid:a.colid,program:program.program,programcode:program.programcode,...(program.year?{academicyear:program.year}:{})};
 const configs=[
 ['Courses','regulationcoursemapds','academicyear regulation program course coursecode semester credit coursetype type'],
 ['Syllabus','syllabusds','academicyear course coursecode semester module topic unit coveragepercentage'],
 ['Assessment scheme','assessmentcomponentds','academicyear course coursecode semester componenttype assessmentcomponent scoretype marks weightage passmarks'],
 ['Course outcomes','courseoutcomeds','academicyear course coursecode semester conumber co'],
 ['Program outcomes','academicprogramoutcomeds','academicyear program programcode pocode po'],
 ['Workload','workloadassignmentds','academicyear course coursecode semester facultyname facultyemail hoursperweek']
 ];
 const sections=await Promise.all(configs.map(async([title,model,projection])=>{try{return [title,{rows:await get(model,scope,projection)}];}catch{return [title,{rows:[],error:'Unable to load this section'}];}}));
 res.json({program,sections:Object.fromEntries(sections)});
}));
module.exports=router;
