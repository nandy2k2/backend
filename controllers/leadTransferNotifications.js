const router=require('express').Router(),mongoose=require('mongoose'),jwt=require('jsonwebtoken');
const User=require('../Models/user'),Menu=require('../Models/menuaccessds'),Task=require('../Models/academicnewtaskds');
const {Lead}=require('../Models/crm2ds');
const schema=(name,fields)=>mongoose.model(name,new mongoose.Schema(fields,{timestamps:true}));
const Notification=require('../Models/userinboxnotification');
const Flow=schema('crm2leadtransferflow',{colid:{type:Number,unique:true},approvers:[String]});
const Transfer=schema('crm2leadtransferrequest',{colid:Number,leadid:String,requester:String,requestername:String,previous:String,status:String,step:Number,approvers:[String],history:[mongoose.Schema.Types.Mixed]});
const text=v=>typeof v==='string'?v.trim():'';
const wrap=(path,fn)=>async(req,res)=>{
 let identity;try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
 try{
 const actor=await User.findOne({colid:Number(identity.colid),email:identity.user}).select('name email colid role').lean();
 if(!actor)return res.sendStatus(401);
 if(path&&!/^all$/i.test(actor.role)&&!await Menu.exists({colid:actor.colid,role:actor.role,path,access:'Allow'})&&!await require('../services/additionalAccess').hasPage(actor,path))return res.sendStatus(403);
 await fn(req,res,actor);
 }catch(e){res.status(400).json({message:e.message});}
};
const transaction=async fn=>{const session=await mongoose.startSession();try{await session.withTransaction(()=>fn(session));}finally{await session.endSession();}};
async function task(row,session){
 await Task.create([{colid:row.colid,facultyemail:row.approvers[row.step],createdby:row.requester,user:row.requester,task:'Review lead transfer to '+row.requestername,category:'CRM 2',pagelink:'/crm2-transfer-lead-approvals',status:'New',referenceModel:'crm2leadtransferrequest',referenceId:String(row._id),referenceLevel:String(row.step+1)}],{session});
}
router.get('/inbox',wrap(null,async(req,res,a)=>res.json({rows:await Notification.find({colid:a.colid,recipient:a.email}).sort({createdAt:-1}).limit(200).lean(),unread:await Notification.countDocuments({colid:a.colid,recipient:a.email,read:false})})));
router.post('/read/:id',wrap(null,async(req,res,a)=>{await Notification.updateOne({_id:req.params.id,colid:a.colid,recipient:a.email},{$set:{read:true}});res.json({success:true});}));
router.get('/users',wrap('/add-user-notification',async(req,res,a)=>{
 const q=text(req.query.search).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 res.json(await User.find({colid:a.colid,$or:[{name:new RegExp(q,'i')},{email:new RegExp(q,'i')}]}).select('name email').limit(50).lean());
}));
const safeLink=value=>{if(!text(value))return '';const url=new URL(value);if(url.protocol!=='https:'&&url.protocol!=='http:')throw Error('Use an HTTP or HTTPS link');return url.href;};
router.post('/notify',wrap('/add-user-notification',async(req,res,a)=>{
 const user=await User.findOne({colid:a.colid,_id:req.body.userid}).select('email').lean();
 if(!user||!text(req.body.title)||!text(req.body.text))throw Error('Select a user and enter title and text');
 await Notification.create({colid:a.colid,recipient:user.email,title:text(req.body.title).slice(0,200),text:text(req.body.text).slice(0,10000),filelink:safeLink(req.body.filelink),link:safeLink(req.body.link)});
 res.json({message:'Notification sent'});
}));
router.post('/upload',require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:10*1024*1024}}).single('file'),wrap('/add-user-notification',async(req,res,a)=>{
 const file=req.file;
 if(!file||!['application/pdf','image/png','image/jpeg'].includes(file.mimetype))throw Error('Upload PDF, PNG or JPG');
 const cfg=await require('../Models/awsconfig').findOne({colid:a.colid,type:/^aws$/i,default:/^yes$/i}).lean();
 if(!cfg?.bucket||!cfg.username||!cfg.password||!cfg.region)throw Error('Default AWS configuration is required');
 const key=a.colid+'/notifications/'+require('crypto').randomBytes(20).toString('hex')+require('path').extname(file.originalname).replace(/[^.a-z0-9]/gi,'');
 await new(require('aws-sdk').S3)({region:cfg.region,accessKeyId:cfg.username,secretAccessKey:cfg.password}).putObject({Bucket:cfg.bucket,Key:key,Body:file.buffer,ContentType:file.mimetype}).promise();
 res.json({url:'https://'+cfg.bucket+'.s3.'+cfg.region+'.amazonaws.com/'+key});
}));
router.get('/workflow',wrap('/crm2-transfer-lead-workflow',async(req,res,a)=>res.json((await Flow.findOne({colid:a.colid}).lean())?.approvers||[])));
router.get('/approvers',wrap('/crm2-transfer-lead-workflow',async(req,res,a)=>res.json(await User.find({colid:a.colid,role:{$not:/^student$/i}}).select('name email').lean())));
router.post('/workflow',wrap('/crm2-transfer-lead-workflow',async(req,res,a)=>{
 const emails=Array.isArray(req.body.approvers)?[...new Set(req.body.approvers.map(text))]:[];
 if(!emails.length||emails.length>20||await User.countDocuments({colid:a.colid,email:{$in:emails},role:{$not:/^student$/i}})!==emails.length)throw Error('Select valid approvers');
 await Flow.updateOne({colid:a.colid},{$set:{approvers:emails}},{upsert:true});res.json({message:'Workflow saved'});
}));
router.post('/request',wrap(null,async(req,res,a)=>{
 if(!/^(counselor|counsellor|crmadmin|all)$/i.test(a.role))return res.sendStatus(403);
 await transaction(async session=>{
 const lead=await Lead.findOne({_id:req.body.leadid,colid:a.colid}).session(session).lean();
 const flow=await Flow.findOne({colid:a.colid}).session(session).lean();
 if(!lead)throw Error('Lead not found');
 if(!flow?.approvers.length)throw Error('Lead transfer approval workflow is not configured');
 if(flow.approvers.includes(a.email))throw Error('You cannot approve your own transfer request');
 if(lead.counselloremail===a.email)throw Error('This lead is already assigned to you');
 // Serialize requests for this lead to prevent concurrent duplicate requests.
 await Lead.updateOne({_id:lead._id,colid:a.colid},{$inc:{transferrevision:1}},{session,strict:false});
 if(await Transfer.exists({colid:a.colid,leadid:String(lead._id),requester:a.email,status:'Pending'}).session(session))throw Error('Your transfer request is already pending');
 const [row]=await Transfer.create([{colid:a.colid,leadid:String(lead._id),requester:a.email,requestername:a.name,previous:lead.counselloremail||'',status:'Pending',step:0,approvers:flow.approvers,history:[]}],{session});
 await task(row,session);
 });res.json({message:'Lead transfer requested'});
}));
router.get('/requests',wrap(null,async(req,res,a)=>res.json((await Transfer.find({colid:a.colid,$or:[{requester:a.email},{approvers:a.email}]}).sort({createdAt:-1}).lean()).map(row=>({...row,canapprove:row.status==='Pending'&&row.approvers[row.step]===a.email&&row.requester!==a.email})))));
router.post('/decision/:id',wrap(null,async(req,res,a)=>{
 const decision=req.body.decision,remarks=text(req.body.remarks);
 if(!['Approved','Rejected'].includes(decision)||(decision==='Rejected'&&!remarks))throw Error('Enter rejection remarks');
 await transaction(async session=>{
 const row=await Transfer.findOne({_id:req.params.id,colid:a.colid,status:'Pending'}).session(session);
 if(!row||row.approvers[row.step]!==a.email||row.requester===a.email)throw Error('This request is not assigned to you');
 const level=row.step+1;
 row.history.push({level,email:a.email,decision,remarks,date:new Date()});
 row.status=decision==='Rejected'?'Rejected':level===row.approvers.length?'Approved':'Pending';
 if(row.status==='Pending')row.step++;
 if(row.status==='Approved'){
 const updated=await Lead.updateOne({_id:row.leadid,colid:a.colid,counselloremail:row.previous||{$in:['',null]}},{$set:{counsellorname:row.requestername,counselloremail:row.requester,counsellorassignedat:new Date()}},{session});
 if(!updated.matchedCount)throw Error('Lead assignment changed; reject this request and raise a new one');
 await Notification.create([{colid:a.colid,recipient:row.requester,title:'Lead transfer approved',text:'Your lead transfer request has been approved. The lead is now assigned to you.',link:'/crm2-my-leads'}],{session});
 }
 await row.save({session});
 await Task.updateMany({colid:a.colid,referenceModel:'crm2leadtransferrequest',referenceId:String(row._id),referenceLevel:String(level)},{$set:{status:'Completed'}},{session});
 if(row.status==='Pending')await task(row,session);
 });res.json({message:'Decision saved'});
}));
module.exports=router;
