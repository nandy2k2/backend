const router=require('express').Router(),mongoose=require('mongoose');
const User=require('../Models/user');
const schema=new mongoose.Schema({colid:Number,regno:String,academicyear:String,examcode:String,status:{type:String,default:'Draft'},snapshot:mongoose.Schema.Types.Mixed,result:mongoose.Schema.Types.Mixed,error:String},{timestamps:true});
schema.index({colid:1,regno:1,academicyear:1,examcode:1},{unique:true});
const State=mongoose.models.examform3state || mongoose.model('examform3state',schema);
const wrap=fn=>async(req,res)=>{try{const input={...req.query,...req.body};const token=String(req.get('authorization')||input.token||'').replace(/^Bearer\s+/i,'');const identity=require('jsonwebtoken').verify(token,process.env.JWT_SECRET);const student=await User.findOne({colid:Number(identity.colid),email:String(identity.user||identity.email).toLowerCase(),role:/^Student$/i}).select('regno').lean();if(!student?.regno)throw Error('Student login required');if(!input.academicyear||!input.examcode)throw Error('Select academic year and exam');req.key={colid:Number(identity.colid),regno:student.regno,academicyear:String(input.academicyear),examcode:String(input.examcode)};await fn(req,res);}catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'This exam form is already submitted or being processed':e.message});}};
router.get('/',wrap(async(req,res)=>{
 let state=await State.findOne(req.key).lean();
 if(!state){const prior=await require('../Models/conductexamformsubmissionds').findOne(req.key).sort({createdAt:-1}).lean();if(prior){await State.updateOne(req.key,{$setOnInsert:{status:'Submitted',snapshot:{formid:prior.formid,exam:prior.exam,examtype:prior.examtype,data:prior.data,documents:prior.documents,courses:prior.courses}}},{upsert:true});state=await State.findOne(req.key).lean();}}
 res.json({data:state});
}));
router.post('/draft',wrap(async(req,res)=>{const snapshot=req.body.snapshot;if(!snapshot||!snapshot.formid)throw Error('Select an exam form');const row=await State.findOneAndUpdate({...req.key,status:'Draft'},{$set:{snapshot}},{upsert:true,new:true,runValidators:true});res.json({data:row});}));
router.post('/submit',wrap(async(req,res)=>{
 const snapshot=req.body.snapshot;if(!snapshot?.formid||!snapshot.courses?.length)throw Error('Select a form and courses');
 await State.updateOne(req.key,{$setOnInsert:{status:'Draft'}},{upsert:true});
 const claim=await State.findOneAndUpdate({...req.key,status:'Draft'},{$set:{status:'Processing',snapshot}},{new:true});
 if(!claim)return res.status(409).json({message:'Exam form already submitted or processing; it cannot be changed or submitted again'});
 const prior=await require('../Models/conductexamformsubmissionds').findOne(req.key).lean();
 if(prior){await State.updateOne(req.key,{$set:{status:'Submitted',snapshot:{...snapshot,formid:prior.formid,data:prior.data,documents:prior.documents,courses:prior.courses}}});return res.status(409).json({message:'An exam form has already been submitted for this exam. Reload to view it.'});}
 req.body={...snapshot,...req.key};
 let code=200, result;
 const proxy={status(value){code=value;return this;},json(value){result=value;return this;}};
 await require('./conductexamformctlrds').submitStudentExamForm(req,proxy);
 if(!result)throw Error('Unable to confirm processing. Reload before retrying.');
 await State.updateOne(req.key,{$set:{status:code<400?'Submitted':code<500?'Draft':'Failed',result,error:code<400?'':result.message}});
 return res.status(code).json(result);
}));
module.exports=router;
