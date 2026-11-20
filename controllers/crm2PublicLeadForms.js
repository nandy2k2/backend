const router=require('express').Router(),mongoose=require('mongoose'),jwt=require('jsonwebtoken'),crypto=require('crypto');
const {Lead,masterModels}=require('../Models/crm2ds');
const User=require('../Models/user'),Menu=require('../Models/menuaccessds');
const Form=mongoose.model('crm2publicleadform',new mongoose.Schema({colid:Number,key:{type:String,unique:true},title:String,source:String,utmsource:String,fields:[String],active:Boolean},{timestamps:true}));
const Captcha=mongoose.model('crm2leadformcaptcha',new mongoose.Schema({_id:String,formid:String,answer:String,expires:Date}));
Captcha.schema.index({expires:1},{expireAfterSeconds:0});
const Limit=mongoose.model('crm2leadformratelimit',new mongoose.Schema({_id:String,count:Number,expires:Date}));
Limit.schema.index({expires:1},{expireAfterSeconds:0});
async function limitPublic(req,res,next){
 try{
  const bucket=Math.floor(Date.now()/60000);
  const key=crypto.createHash('sha256').update(String(req.ip)+'|'+String(req.params.key)+'|'+bucket).digest('hex');
  const update={$inc:{count:1},$setOnInsert:{expires:new Date((bucket+2)*60000)}};
  let row;
  try{row=await Limit.findOneAndUpdate({_id:key},update,{upsert:true,new:true});}
  catch(e){if(e.code!==11000)throw e;row=await Limit.findOneAndUpdate({_id:key},{$inc:{count:1}},{new:true});}
  if(!row||row.count>20)return res.status(429).json({message:'Too many requests. Please try again in a minute.'});
  next();
 }catch{res.status(503).json({message:'Please try again shortly.'});}
}
const required=['name','email','phone'];
const optional=['gender','academicyear','address','country','state','city','district','pincode','fathername','mothername','guardianname','guardianmobile','guardianemail','category','annualincome','skills','degree','department'];
const allowed=[...required,...optional].filter(key=>Lead.schema.path(key));
const text=v=>typeof v==='string'?v.trim():'';
const auth=fn=>async(req,res)=>{
 try{
 let identity;try{identity=jwt.verify(text(req.get('authorization')).replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return res.sendStatus(401);}
 const a=await User.findOne({colid:Number(identity.colid),email:identity.user}).select('colid role').lean();
 if(!a||/^(student|agent|publisher)$/i.test(a.role))return res.sendStatus(403);
 const path=req.path.startsWith('/performance')?'/crm2-performance-report':'/crm2-lead-form';
 if(!/^(all|crmadmin)$/i.test(a.role)&&!await Menu.exists({colid:a.colid,role:a.role,path,access:'Allow'})&&!await require('../services/additionalAccess').hasPage(a,path))return res.sendStatus(403);
 await fn(req,res,a);
 }catch(e){res.status(400).json({message:e.message});}
};
router.get('/setup',auth(async(req,res,a)=>res.json({fields:allowed,forms:await Form.find({colid:a.colid}).sort({createdAt:-1}).lean(),sources:await masterModels.source.find({colid:a.colid}).select('name').lean(),utmsources:await masterModels.utmsource.find({colid:a.colid}).select('name').lean()})));
router.post('/save',auth(async(req,res,a)=>{
 const b=req.body,fields=[...new Set([...required,...(Array.isArray(b.fields)?b.fields:[])])];
 if(!text(b.title)||!text(b.source)||!text(b.utmsource)||fields.some(field=>!allowed.includes(field)))throw Error('Enter title, source, UTM source and valid fields');
 if(!await masterModels.source.exists({colid:a.colid,name:b.source})||!await masterModels.utmsource.exists({colid:a.colid,name:b.utmsource}))throw Error('Select sources from master');
 const payload={title:text(b.title),source:b.source,utmsource:b.utmsource,fields,active:b.active===true};
 const row=b.id?await Form.findOneAndUpdate({_id:b.id,colid:a.colid},{$set:payload},{new:true}):await Form.create({...payload,colid:a.colid,key:crypto.randomBytes(24).toString('hex')});
 if(!row)throw Error('Form not found');
 res.json(row);
}));
router.get('/public/:key',limitPublic,async(req,res)=>{
 try{
 const form=await Form.findOne({key:req.params.key,active:true}).lean();
 if(!form)return res.status(404).json({message:'This form is not available'});
 const x=crypto.randomInt(10,50),y=crypto.randomInt(1,10),id=crypto.randomBytes(24).toString('hex');
 await Captcha.create({_id:id,formid:String(form._id),answer:String(x+y),expires:new Date(Date.now()+5*60000)});
 res.json({title:form.title,fields:form.fields,captcha:{id,question:`${x} + ${y}`}});
 }catch(e){res.status(400).json({message:'Unable to load form'});}
});
router.post('/public/:key',limitPublic,async(req,res)=>{
 try{
 const form=await Form.findOne({key:req.params.key,active:true}).lean();
 if(!form)return res.status(404).json({message:'This form is not available'});
 const captcha=await Captcha.findOneAndDelete({_id:text(req.body.captchaid),formid:String(form._id),expires:{$gt:new Date()}});
 if(!captcha||captcha.answer!==text(req.body.captchaanswer))throw Error('CAPTCHA is incorrect or expired. Reload the form and try again.');
 const input={};
 for(const field of form.fields){const value=req.body.data?.[field];if(value!=null){if(typeof value!=='string'||value.length>2000)throw Error('Invalid field value');input[field]=value.trim();}}
 input.email=text(input.email).toLowerCase();
 const emailkey=input.email,phonekey=text(input.phone).replace(/\D/g,'');
 if(!text(input.name)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailkey)||phonekey.length<7||phonekey.length>15)throw Error('Enter name, valid email and phone');
 const duplicateQuery={colid:form.colid,$or:[{emailkey},{phonekey},{email:new RegExp('^'+emailkey.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i')}]};
 let matches=await Lead.find(duplicateQuery).lean();
 if(!matches.length){
  try{await Lead.create({...input,colid:form.colid,emailkey,phonekey,source:form.source,utmsource:form.utmsource,active:'Yes',admitted:'No',addedby:'Lead form',dateadded:new Date(),user:'Public lead form'});}
  catch(e){if(e.code!==11000)throw e;matches=await Lead.find(duplicateQuery).lean();if(!matches.length)throw e;}
 }
 for(const lead of matches)await require('../services/crm2LeadHistory').recordDuplicate(lead,input,'Public lead form','Lead form: '+form.title+' | '+form.source+' | '+form.utmsource);
 res.json({message:'Thank you for your interest we will get back to you soon.'});
 }catch(e){res.status(400).json({message:e.message});}
});
router.get('/performance/options',auth(async(req,res,a)=>{
 const fields=['source','utmsource','academicyear','pipeline','admitted','active','counselloremail','agentname','leadgroup','crmcategory','city','state','country'];
 res.json(Object.fromEntries(await Promise.all(fields.map(async field=>[field,(await Lead.distinct(field,{colid:a.colid})).filter(Boolean).sort()]))));
}));
router.post('/performance',auth(async(req,res,a)=>{
 const query=require('../utils/crm2LeadFilters').applyFilters({colid:a.colid},req.body);
 res.json(await Lead.find(query).select('name email phone source utmsource academicyear pipeline admitted active counsellorname agentname dateadded').sort({dateadded:-1}).lean());
}));
module.exports=router;
