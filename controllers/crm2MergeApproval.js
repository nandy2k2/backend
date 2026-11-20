const router=require('express').Router(),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const {Lead}=require('../Models/crm2ds'),User=require('../Models/user'),Menu=require('../Models/menuaccessds'),Task=require('../Models/academicnewtaskds');
const {comparisonFields,mergeChanges,versionOf}=require('../utils/crm2MergeLead');
const Flow=mongoose.model('crm2mergeapprovalflow',new mongoose.Schema({colid:{type:Number,unique:true},approvers:[String]},{timestamps:true}));
const Request=mongoose.model('crm2mergeapprovalrequest',new mongoose.Schema({colid:Number,pair:String,ids:[String],status:String,step:Number,approvers:[String],history:[mongoose.Schema.Types.Mixed]},{timestamps:true}));
Request.schema.index({colid:1,pair:1},{unique:true});
const text=v=>typeof v==='string'?v.trim():'';
const auth=(admin,fn)=>async(req,res)=>{
 let token;try{token=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
 try{
 const a=await User.findOne({colid:Number(token.colid),email:token.user}).select('name email colid role').lean();
 if(!a||/^(student|agent|publisher)$/i.test(a.role))return res.sendStatus(403);
 if(admin&&!/^all$/i.test(a.role)&&!await Menu.exists({colid:a.colid,role:a.role,path:'/crm2-merge-approval-workflow',access:'Allow'})&&!await require('../services/additionalAccess').hasPage(a,'/crm2-merge-approval-workflow'))return res.sendStatus(403);
 await fn(req,res,a);
 }catch(e){res.status(400).json({message:e.message});}
};
async function task(row,session){
 await Task.create([{colid:row.colid,facultyemail:row.approvers[row.step],task:'Approve guardian-mobile lead merge',category:'CRM 2',pagelink:'/crm2-approve-merge-lead',status:'New',referenceModel:'crm2mergeapprovalrequest',referenceId:String(row._id),referenceLevel:String(row.step+1)}],{session});
}
async function detect(lead,guardian){
 const phone=text(guardian??lead.guardianmobile).replace(/\D/g,'');
 if(phone.length<7||phone.length>15)return {created:0};
 const matches=await Lead.find({colid:lead.colid,_id:{$ne:lead._id},active:{$ne:'No'},$or:[{phonekey:phone},{phone:phone}]}).select('_id').lean();
 if(!matches.length)return {created:0};
 const flow=await Flow.findOne({colid:lead.colid}).lean();
 if(!flow?.approvers.length)throw Error('Guardian mobile matches another lead. Configure Merge Lead Approval Workflow.');
 let created=0;
 for(const other of matches){
  const ids=[String(lead._id),String(other._id)].sort(),pair=ids.join(':');
  const session=await mongoose.startSession();
  try{await session.withTransaction(async()=>{
   if(await Request.exists({colid:lead.colid,pair}).session(session))return;
   const [row]=await Request.create([{colid:lead.colid,pair,ids,status:'Pending',step:0,approvers:flow.approvers,history:[]}],{session});
   await task(row,session);created++;
  });}catch(e){if(e.code!==11000)throw e;}finally{await session.endSession();}
 }
 return {created};
}
router.get('/workflow',auth(true,async(req,res,a)=>res.json({approvers:(await Flow.findOne({colid:a.colid}).lean())?.approvers||[],users:await User.find({colid:a.colid,role:{$not:/^student$/i}}).select('name email').lean()})));
router.post('/workflow',auth(true,async(req,res,a)=>{
 const approvers=Array.isArray(req.body.approvers)?[...new Set(req.body.approvers.map(text))]:[];
 if(!approvers.length||approvers.length>20||await User.countDocuments({colid:a.colid,email:{$in:approvers},role:{$not:/^student$/i}})!==approvers.length)throw Error('Select valid approvers');
 await Flow.updateOne({colid:a.colid},{$set:{approvers}},{upsert:true});res.json({message:'Workflow saved'});
}));
router.post('/detect',auth(false,async(req,res,a)=>{
 const lead=await Lead.findOne({_id:req.body.id,colid:a.colid,...(/^(all|crmadmin)$/i.test(a.role)?{}:{counselloremail:a.email})}).lean();
 if(!lead)throw Error('Save the lead first or select a lead assigned to you');
 res.json(await detect(lead,req.body.guardianmobile));
}));
router.get('/requests',auth(false,async(req,res,a)=>res.json((await Request.find({colid:a.colid,approvers:a.email}).sort({createdAt:-1}).lean()).map(row=>({...row,canapprove:row.status==='Pending'&&row.approvers[row.step]===a.email})))));
router.get('/compare/:id',auth(false,async(req,res,a)=>{
 const row=await Request.findOne({_id:req.params.id,colid:a.colid,approvers:a.email}).lean();
 if(!row||row.status!=='Pending'||row.approvers[row.step]!==a.email)throw Error('This request is not pending with you');
 const leads=await Lead.find({colid:a.colid,_id:{$in:row.ids}}).select(comparisonFields.map(f=>f.field).join(' ')).sort({createdAt:1,_id:1}).lean();
 if(leads.length!==2)throw Error('Lead records are no longer available');
 res.json({fields:comparisonFields,leads,versions:Object.fromEntries(leads.map(lead=>[String(lead._id),versionOf(lead)]))});
}));
router.post('/decision/:id',auth(false,async(req,res,a)=>{
 const decision=req.body.decision;
 if(!['Approved','Rejected'].includes(decision))throw Error('Select a valid decision');
 const session=await mongoose.startSession();
 try{await session.withTransaction(async()=>{
 const row=await Request.findOne({_id:req.params.id,colid:a.colid,status:'Pending'}).session(session);
 if(!row||row.approvers[row.step]!==a.email)throw Error('This request is not pending with you');
 const level=row.step+1;
 if(decision==='Approved'){
 const leads=await Lead.find({colid:a.colid,_id:{$in:row.ids}}).select(comparisonFields.map(f=>f.field).join(' ')).session(session).lean();
 if(leads.length!==2)throw Error('Lead records are no longer available');
 const changes=mergeChanges(leads,req.body.primaryId,req.body.choices,req.body.versions);
 if(level===row.approvers.length){
  changes.$set.updatedby=a.email;
  await Lead.updateOne({colid:a.colid,_id:req.body.primaryId},changes,{session,runValidators:true});
  await Lead.updateMany({colid:a.colid,_id:{$in:row.ids.filter(id=>id!==req.body.primaryId)}},{$set:{active:'No',updatedby:a.email}},{session});
 }
 }
 row.history.push({level,decision,email:a.email,date:new Date(),primaryId:req.body.primaryId,choices:req.body.choices});
 row.status=decision==='Rejected'?'Rejected':level===row.approvers.length?'Approved':'Pending';
 if(row.status==='Pending')row.step++;
 await row.save({session});
 await Task.updateMany({colid:a.colid,referenceModel:'crm2mergeapprovalrequest',referenceId:String(row._id),referenceLevel:String(level)},{$set:{status:'Completed'}},{session});
 if(row.status==='Pending')await task(row,session);
 });}finally{await session.endSession();}
 res.json({message:'Merge approval decision recorded'});
}));
module.exports={router,detect};
