const router=require('express').Router();
const mongoose=require('mongoose');
const jwt=require('jsonwebtoken');
const User=require('../Models/user');
const Menu=require('../Models/menuaccessds');
const Task=require('../Models/academicnewtaskds');
const model=(name,fields)=>mongoose.model(name,new mongoose.Schema(fields,{timestamps:true}));
const flow=model('temporaryaccessworkflow',{colid:{type:Number,unique:true},approvers:[{userid:String,email:String,name:String}]});
const Request=model('temporaryaccessrequest',{
  colid:Number,ownerid:String,email:String,group:String,pages:[{path:String,title:String}],
  start:String,end:String,status:String,step:Number,approvers:[{email:String,name:String}],
  history:[{level:Number,decision:String,email:String,remarks:String,date:Date}]
});
Request.schema.index({colid:1,ownerid:1,status:1,start:1,end:1});
const clean=v=>typeof v==='string'?v.trim():'';
const exact=v=>new RegExp('^'+clean(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const safePath=v=>typeof v==='string'&&/^\/[a-z0-9][a-z0-9/_-]*$/i.test(v);
const wrap=(fn,admin=false)=>async(req,res)=>{
  let token;
  try{token=jwt.verify(clean(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
  try{
    if(!clean(token.user)||!Number(token.colid))return res.sendStatus(401);
    const actor=await User.findOne({colid:Number(token.colid),email:exact(token.user)}).select('colid email name role').lean();
    if(!actor)return res.sendStatus(401);
    if(admin&&!/^all$/i.test(actor.role)&&!await Menu.exists({colid:actor.colid,role:actor.role,path:'/temporary-access-workflow',access:'Allow'}))return res.sendStatus(403);
    await fn(req,res,actor);
  }catch(e){res.status(400).json({message:e.message});}
};
const inTransaction=async fn=>{const session=await mongoose.startSession();try{await session.withTransaction(()=>fn(session));}finally{await session.endSession();}};
async function catalog(colid){
  const rules=await Menu.find({colid,access:'Allow'}).select('menugroup title path').sort({menugroup:1,title:1}).lean();
  const groups=new Map();
  for(const row of rules){
    if(!safePath(row.path)||!row.menugroup||!row.title||row.path.toLowerCase().startsWith('/temporary-access')||row.path.toLowerCase()==='/menuaccesscontrol')continue;
    if(!groups.has(row.menugroup))groups.set(row.menugroup,new Map());
    groups.get(row.menugroup).set(row.path,{path:row.path,title:row.title});
  }
  return [...groups].map(([group,pages])=>({group,pages:[...pages.values()]}));
}
async function task(row,session){
  const approver=row.approvers[row.step];
  await Task.create([{colid:row.colid,user:row.email,createdby:row.email,faculty:approver.name,facultyemail:approver.email,task:'Review temporary access request: '+row.group,category:'Temporary Access',pagelink:'/temporary-access-approvals',startdate:new Date(),duedate:new Date(row.end+'T18:29:59Z'),status:'New',referenceModel:'temporaryaccessrequest',referenceId:String(row._id),referenceLevel:String(row.step+1)}],{session});
}
router.get('/catalog',wrap(async(req,res,actor)=>res.json(await catalog(actor.colid))));
router.get('/mine',wrap(async(req,res,actor)=>res.json(await Request.find({colid:actor.colid,ownerid:String(actor._id)}).select('-approvers').sort({createdAt:-1}).lean())));
router.get('/active',wrap(async(req,res,actor)=>{
  const day=today();
  const rows=await Request.find({colid:actor.colid,ownerid:String(actor._id),status:'Approved',start:{$lte:day},end:{$gte:day}}).select('group pages end').lean();
  const allowed=await catalog(actor.colid);
  const groups=new Map(allowed.map(row=>[row.group,new Set(row.pages.map(page=>page.path))]));
  res.json(rows.map(row=>({...row,pages:row.pages.filter(page=>groups.get(row.group)?.has(page.path))})).filter(row=>row.pages.length));
}));
router.post('/request',wrap(async(req,res,actor)=>{
  const {start,end,group}=req.body;
  const paths=Array.isArray(req.body.paths)?[...new Set(req.body.paths)]:[];
  if(!validDate(start)||!validDate(end)||start>end||end<today())throw Error('Select a valid date range that has not expired');
  const available=(await catalog(actor.colid)).find(row=>row.group===group);
  const pages=available?.pages.filter(page=>paths.includes(page.path))||[];
  if(!paths.length||pages.length!==paths.length)throw Error('Select one or more pages from the selected group');
  await inTransaction(async session=>{
    const workflow=await flow.findOne({colid:actor.colid}).session(session).lean();
    if(!workflow?.approvers.length)throw Error('Temporary access approval is not configured');
    if(workflow.approvers.some(row=>exact(actor.email).test(row.email)))throw Error('An approver cannot request access through their own workflow');
    const [row]=await Request.create([{colid:actor.colid,ownerid:String(actor._id),email:actor.email,group,pages,start,end,status:'Pending',step:0,approvers:workflow.approvers}],{session});
    await task(row,session);
  });
  res.status(201).json({message:'Request submitted'});
}));
router.get('/workflow',wrap(async(req,res,actor)=>res.json((await flow.findOne({colid:actor.colid}).lean())?.approvers||[]),true));
router.get('/staff',wrap(async(req,res,actor)=>{
  const search=clean(req.query.search).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(search,'i');
  res.json(await User.find({colid:actor.colid,role:{$not:/^student$/i},$or:[{email:pattern},{name:pattern}]}).select('email name').sort({name:1}).limit(50).lean());
},true));
router.post('/workflow',wrap(async(req,res,actor)=>{
  const ids=Array.isArray(req.body.ids)?[...new Set(req.body.ids)]:[];
  if(!ids.length||ids.length>20||ids.some(id=>typeof id!=='string'||!mongoose.isValidObjectId(id)))throw Error('Configure 1 to 20 approval levels');
  const users=await User.find({colid:actor.colid,_id:{$in:ids},role:{$not:/^student$/i}}).select('name email').lean();
  if(users.length!==ids.length||users.some(user=>!user.email))throw Error('Select valid staff members');
  const approvers=ids.map(id=>{const row=users.find(user=>String(user._id)===id);return {userid:id,email:row.email,name:row.name};});
  await flow.updateOne({colid:actor.colid},{$set:{approvers}},{upsert:true});
  res.json(approvers);
},true));
router.get('/approvals',wrap(async(req,res,actor)=>{
  const rows=await Request.find({colid:actor.colid,status:'Pending','approvers.email':exact(actor.email)}).sort({createdAt:1}).lean();
  res.json(rows.filter(row=>exact(actor.email).test(row.approvers[row.step]?.email)));
}));
router.post('/decision/:id',wrap(async(req,res,actor)=>{
  const {decision}=req.body,remarks=clean(req.body.remarks).slice(0,2000);
  if(!['Approved','Rejected'].includes(decision)||(decision==='Rejected'&&!remarks))throw Error('Enter rejection remarks');
  await inTransaction(async session=>{
    const row=await Request.findOne({_id:req.params.id,colid:actor.colid,status:'Pending'}).session(session);
    if(!row||row.ownerid===String(actor._id)||!exact(actor.email).test(row.approvers[row.step]?.email))throw Error('This request is not assigned to you');
    if(decision==='Approved'&&row.end<today())throw Error('This request has expired. Reject it and ask for a new date range.');
    const step=row.step;
    row.status=decision==='Rejected'?'Rejected':step+1===row.approvers.length?'Approved':'Pending';
    row.history.push({level:step+1,decision,email:actor.email,remarks,date:new Date()});
    if(row.status==='Pending')row.step++;
    await row.save({session});
    await Task.updateMany({colid:actor.colid,referenceModel:'temporaryaccessrequest',referenceId:String(row._id),referenceLevel:String(step+1),status:{$ne:'Completed'}},{$set:{status:'Completed'}},{session});
    if(row.status==='Pending')await task(row,session);
  });
  res.json({message:'Decision recorded'});
}));
module.exports=router;
