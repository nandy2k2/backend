const router=require('express').Router();
const mongoose=require('mongoose');
const jwt=require('jsonwebtoken');
const User=require('../Models/user');
const Menu=require('../Models/menuaccessds');
const Task=require('../Models/academicnewtaskds');
const Email=require('../Models/emailconfigurationds');
const ping=require('./pingwhatsappsendctlrds');
const Institution=require('../Models/insdetails');
const schema=(name,fields)=>mongoose.model(name,new mongoose.Schema({colid:{type:Number,index:true},...fields},{timestamps:true}));
const Requirement=schema('visitingfacultyrequirement',{
  academicyear:String,startdate:String,enddate:String,duration:String,title:String,description:String,
  competency:[String],hours:Number,days:Number,amount:Number,engagementtype:String,existing:String,skills:[String],active:String,
  owner:String,status:String,approvers:[{email:String,name:String}],step:Number,history:[mongoose.Schema.Types.Mixed]
});
const Workflow=schema('visitingfacultyworkflow',{colid:{type:Number,unique:true},approvers:[{userid:String,email:String,name:String}]});
const Appointment=schema('visitingfacultyappointment',{
  requirement:mongoose.Schema.Types.ObjectId,userid:mongoose.Schema.Types.ObjectId,name:String,email:String,phone:String,
  title:String,academicyear:String,engagementtype:String,amount:Number,startdate:String,enddate:String,role:{type:String,default:'Visiting Faculty'},
  letter:{type:mongoose.Schema.Types.Mixed}
});
Appointment.schema.index({colid:1,requirement:1,userid:1},{unique:true});
const paths={requirements:'/visiting-faculty-requirements',workflow:'/visiting-faculty-workflow',approvals:'/visiting-faculty-approvals',appointments:'/visiting-faculty-appointments'};
const text=v=>typeof v==='string'?v.trim():'';
const exact=v=>new RegExp('^'+text(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
const wrap=(page,fn)=>async(req,res)=>{
  let identity;
  try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}
  catch{return res.status(401).json({message:'Sign in to continue'});}
  try{
    if(!identity.user||!Number(identity.colid))return res.sendStatus(401);
    const actor=await User.findOne({colid:Number(identity.colid),email:exact(identity.user)}).select('colid role name email').lean();
    if(!actor||/^student$/i.test(actor.role)||!(/^all$/i.test(actor.role)||await Menu.exists({colid:actor.colid,role:actor.role,path:paths[page],access:'Allow'})))return res.status(403).json({message:'Page access is required'});
    await fn(req,res,actor);
  }catch(e){res.status(e.code===11000?409:400).json({message:e.code===11000?'This user is already appointed for this requirement':e.message});}
};
const pingCall=(action,colid,body)=>new Promise((resolve,reject)=>{
  let status=200;
  Promise.resolve(action({user:{colid},body},{status(code){status=code;return this;},json(data){status>=400?reject(Error(data.error||'WhatsApp request failed')):resolve(data);}})).catch(reject);
});
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(text(v))&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const checkDates=(start,end)=>{if(!date(start)||!date(end)||start>end)throw Error('Enter a valid start and end date');};
const list=v=>Array.isArray(v)?[...new Set(v.map(text).filter(Boolean))].slice(0,100):[];
const amount=v=>{if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Enter a non-negative amount per sprint');return Number(v);};
const transaction=async fn=>{const session=await mongoose.startSession();try{return await session.withTransaction(()=>fn(session));}finally{await session.endSession();}};
const findUser=(colid,id)=>User.findOne({_id:id,colid,role:{$not:/^student$/i}}).select('name email phone').lean();
router.get('/workflow',wrap('workflow',async(req,res,{colid})=>res.json((await Workflow.findOne({colid}).lean())?.approvers||[])));
router.post('/workflow',wrap('workflow',async(req,res,{colid})=>{
  const ids=list(req.body.ids);if(!ids.length)throw Error('Add at least one approval level');
  const users=await Promise.all(ids.map(id=>findUser(colid,id)));
  if(users.some(row=>!row?.email))throw Error('Select valid staff accounts');
  const approvers=users.map(row=>({userid:String(row._id),name:row.name,email:row.email}));
  await Workflow.findOneAndUpdate({colid},{$set:{approvers}},{upsert:true});res.json(approvers);
}));
for(const page of ['workflow','appointments'])router.get('/users/'+page,wrap(page,async(req,res,{colid})=>{
  const search=text(req.query.search).slice(0,100);
  const pattern=new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
  res.json(await User.find({colid,role:{$not:/^student$/i},$or:[{name:pattern},{email:pattern}]}).select('name email').sort({name:1}).limit(50).lean());
}));
router.get('/requirements',wrap('requirements',async(req,res,actor)=>res.json(await Requirement.find({colid:actor.colid,...(/^all$/i.test(actor.role)?{}:{owner:actor.email})}).sort({createdAt:-1}).lean())));
router.post('/requirements',wrap('requirements',async(req,res,actor)=>{
  const b=req.body;
  checkDates(b.startdate,b.enddate);
  if(!text(b.academicyear)||!text(b.title)||!text(b.duration)||!['Sprint','Semester','Trimester','Year'].includes(b.engagementtype)||!['Yes','No'].includes(b.existing)||!['Yes','No'].includes(b.active))throw Error('Complete all required fields');
  const hours=Number(b.hours),days=Number(b.days);
  if(!(hours>0&&hours<=24)||!Number.isInteger(days)||days<1||days>7)throw Error('Enter 1 to 7 days per week and valid hours per day');
  const fields={...Object.fromEntries(['academicyear','startdate','enddate','duration','title','description','engagementtype','existing','active'].map(k=>[k,text(b[k])])),competency:list(b.competency),skills:list(b.skills),hours,days,amount:amount(b.amount)};
  const row=b.id?await Requirement.findOneAndUpdate({_id:b.id,colid:actor.colid,owner:actor.email,status:{$in:['Draft','Rejected']}},{$set:{...fields,status:'Draft'}},{new:true}):await Requirement.create({...fields,colid:actor.colid,owner:actor.email,status:'Draft'});
  if(!row)throw Error('Only your draft or rejected requirements can be edited');
  res.json(row);
}));
async function approvalTask(row,session){
  const approver=row.approvers[row.step];
  await Task.create([{colid:row.colid,user:row.owner,createdby:row.owner,academicyear:row.academicyear,faculty:approver.name,facultyemail:approver.email,task:'Approve visiting faculty requirement: '+row.title,category:'Visiting Faculty',pagelink:paths.approvals,status:'New',startdate:new Date(),duedate:new Date(row.startdate),referenceModel:'visitingfacultyrequirement',referenceId:String(row._id),referenceLevel:String(row.step+1)}],{session});
}
router.post('/submit/:id',wrap('requirements',async(req,res,actor)=>{
  await transaction(async session=>{
    const flow=await Workflow.findOne({colid:actor.colid}).session(session);
    if(!flow?.approvers.length)throw Error('Configure the approval levels first');
    const row=await Requirement.findOneAndUpdate({_id:req.params.id,colid:actor.colid,owner:actor.email,status:'Draft'},{$set:{status:'Pending',step:0,approvers:flow.approvers}},{new:true,session});
    if(!row)throw Error('Only your drafts can be submitted');
    await approvalTask(row,session);
  });res.json({message:'Submitted for approval'});
}));
router.post('/active/:id',wrap('requirements',async(req,res,actor)=>{
  if(!['Yes','No'].includes(req.body.active))throw Error('Select Yes or No');
  const row=await Requirement.findOneAndUpdate({_id:req.params.id,colid:actor.colid,owner:actor.email,status:'Approved'},{$set:{active:req.body.active}},{new:true});
  if(!row)throw Error('Approved requirement not found');
  res.json(row);
}));
router.get('/approvals',wrap('approvals',async(req,res,actor)=>res.json((await Requirement.find({colid:actor.colid,status:'Pending','approvers.email':exact(actor.email)}).lean()).filter(row=>exact(actor.email).test(row.approvers[row.step]?.email)))));
router.post('/approve/:id',wrap('approvals',async(req,res,actor)=>{
  const {decision}=req.body,remarks=text(req.body.remarks);
  if(!['Approved','Rejected'].includes(decision)||(decision==='Rejected'&&!remarks))throw Error('Enter a reason for rejection');
  await transaction(async session=>{
    const row=await Requirement.findOne({_id:req.params.id,colid:actor.colid,status:'Pending'}).session(session);
    if(!row||!exact(actor.email).test(row.approvers[row.step]?.email))throw Error('This requirement is not assigned to you');
    const step=row.step;
    row.history.push({level:step+1,decision,remarks,by:actor.email,date:new Date()});
    row.status=decision==='Rejected'?'Rejected':step+1===row.approvers.length?'Approved':'Pending';
    if(row.status==='Pending')row.step++;
    await row.save({session});
    await Task.updateMany({colid:actor.colid,referenceModel:'visitingfacultyrequirement',referenceId:String(row._id),referenceLevel:String(step+1),status:{$in:['New','In process']}},{$set:{status:'Completed'}},{session});
    if(row.status==='Pending')await approvalTask(row,session);
  });res.json({message:'Decision recorded'});
}));
router.get('/eligible',wrap('appointments',async(req,res,{colid})=>res.json(await Requirement.find({colid,status:'Approved',active:'Yes'}).select('-history -approvers').sort({createdAt:-1}).lean())));
router.get('/appointments',wrap('appointments',async(req,res,{colid})=>res.json(await Appointment.find({colid}).select('-letter').sort({createdAt:-1}).lean())));
router.post('/appointments',wrap('appointments',async(req,res,{colid})=>{
  const b=req.body;
  checkDates(b.startdate,b.enddate);
  const [requirement,user]=await Promise.all([Requirement.findOne({colid,_id:b.requirement,status:'Approved',active:'Yes'}).lean(),findUser(colid,b.userid)]);
  if(!requirement||!user)throw Error('Select an approved active requirement and a staff account');
  if(b.startdate<requirement.startdate||b.enddate>requirement.enddate)throw Error('Appointment dates must be within the requirement dates');
  res.json(await Appointment.create({colid,requirement:requirement._id,userid:user._id,name:user.name,email:user.email,phone:user.phone,title:requirement.title,academicyear:requirement.academicyear,engagementtype:requirement.engagementtype,amount:amount(b.amount),startdate:b.startdate,enddate:b.enddate}));
}));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const offerLink=(req,row)=>{
  const base=new URL(process.env.VISITING_FACULTY_PUBLIC_API_URL||`${req.protocol}://${req.get('host')}`);
  const token=jwt.sign({purpose:'visiting-faculty-offer',id:String(row._id),colid:row.colid},process.env.JWT_SECRET,{expiresIn:'30d'});
  return new URL('/api/v2/visiting-faculty/public/'+token,base).href;
};
router.post('/offer/:id',wrap('appointments',async(req,res,{colid})=>{
  const row=await Appointment.findOne({colid,_id:req.params.id});
  if(!row)throw Error('Appointment not found');
  if(!row.letter){
    const ins=await Institution.findOne({colid}).lean()||{};
    row.letter={institution:ins.institutionname||ins.nameofinstitution||ins.name||'',address:ins.address||ins.address1||'',logo:ins.logo||ins.logolink||'',issued:new Date().toISOString().slice(0,10)};
    await row.save();
  }
  res.json({url:offerLink(req,row)});
}));
router.get('/public/:token',async(req,res)=>{
  try{
    const token=jwt.verify(req.params.token,process.env.JWT_SECRET);
    if(token.purpose!=='visiting-faculty-offer')return res.sendStatus(404);
    const row=await Appointment.findOne({_id:token.id,colid:token.colid}).lean();
    if(!row?.letter)return res.sendStatus(404);
    const l=row.letter;
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; img-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"});
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visiting Faculty Offer</title><style>body{font:16px/1.55 Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#182333}header{text-align:center;border-bottom:2px solid #245575;padding-bottom:16px}img{max-width:110px;max-height:80px}dt{font-weight:bold}dd{margin:0 0 12px}@media print{button{display:none}}</style></head><body><header>${/^https:\/\//i.test(l.logo)?`<img alt="Institution logo" src="${escape(l.logo)}">`:''}<h2>${escape(l.institution)}</h2><div>${escape(l.address)}</div></header><h1>Visiting Faculty Offer</h1><p>Issued: ${escape(l.issued)}</p><p>Dear ${escape(row.name)},</p><p>We are pleased to offer you a visiting faculty engagement for ${escape(row.title)}.</p><dl><dt>Academic year</dt><dd>${escape(row.academicyear)}</dd><dt>Engagement type</dt><dd>${escape(row.engagementtype)}</dd><dt>Engagement dates</dt><dd>${escape(row.startdate)} to ${escape(row.enddate)}</dd><dt>Amount per sprint (INR)</dt><dd>${escape(Number(row.amount).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}))}</dd></dl><button onclick="window.print()">Print offer</button></body></html>`);
  }catch{return res.status(404).send('Offer link is invalid or expired.');}
});
router.get('/communication',wrap('appointments',async(req,res,{colid})=>{
  const emails=await Email.find({colid,isactive:/^yes$/i}).select('username provider').lean();
  const whatsapp=await pingCall(ping.options,colid,{}).catch(()=>({}));
  res.json({emails,whatsapp});
}));
router.post('/offer/:id/send',wrap('appointments',async(req,res,actor)=>{
  const row=await Appointment.findOne({colid:actor.colid,_id:req.params.id}).lean();
  if(!row?.letter)throw Error('Generate the offer letter before sending');
  const url=offerLink(req,row);
  if(req.body.mode==='whatsapp'){
    const inputs=Array.isArray(req.body.values)?req.body.values.map(text):[];
    if(!inputs.some(v=>v.includes('{offerLink}')))throw Error('Add {offerLink} to a WhatsApp template variable');
    const values=inputs.map(v=>v.replaceAll('{offerLink}',url));
    const result=await pingCall(ping.sendDirect,actor.colid,{configid:req.body.configid,templateid:req.body.templateid,language:text(req.body.language)||'en',values,mobileNumbers:String(row.phone||'').replace(/\D/g,''),user:actor.email});
    if(!result.sent)throw Error(result.recipients?.[0]?.error||'WhatsApp was not confirmed by Ping');
  }else{
    const subject=text(req.body.subject),body=text(req.body.body);
    if(req.body.mode!=='email'||!subject||!body)throw Error('Enter the email subject and body');
    const config=await Email.findOne({colid:actor.colid,_id:req.body.configid,isactive:/^yes$/i}).lean();
    if(!config?.username||!config.password)throw Error('Select an active email configuration');
    if(!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(row.email||''))throw Error('The appointee email is invalid');
    const host=config.smtp||config.smptp||(/gmail/i.test(config.provider)?'smtp.gmail.com':'');
    if(!host)throw Error('SMTP host is missing');
    const addresses=await require('node:dns').promises.resolve4(host);
    const blocked=new (require('node:net').BlockList)();
    for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['100.64.0.0',10],['224.0.0.0',3]])blocked.addSubnet(address,prefix);
    if(!addresses.length||addresses.some(address=>blocked.check(address)))throw Error('Use a public SMTP server');
    const port=Number(config.port)||587,secure=port===465||/^(yes|true)$/i.test(config.secure);
    const transport=require('nodemailer').createTransport({host:addresses[0],tls:{servername:host},port,secure,requireTLS:!secure,auth:{user:config.username,pass:config.password},connectionTimeout:12000,socketTimeout:20000});
    const sent=await transport.sendMail({from:config.username,to:row.email,subject,text:body.includes('{offerLink}')?body.replaceAll('{offerLink}',url):body+'\n\n'+url});
    if(!sent.accepted?.length)throw Error('SMTP did not accept the message');
  }
  res.json({message:'Offer sent'});
}));
module.exports=router;
