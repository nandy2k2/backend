const mongoose=require('mongoose');
const counterSchema=new mongoose.Schema({colid:Number,year:Number,serial:{type:Number,default:0}});counterSchema.index({colid:1,year:1},{unique:true});
const Counter=mongoose.models.purchase2prcounter||mongoose.model('purchase2prcounter',counterSchema);
const reservationSchema=new mongoose.Schema({colid:Number,prnumber:String,used:{type:Boolean,default:false}});reservationSchema.index({colid:1,prnumber:1},{unique:true});
const Reservation=mongoose.models.purchase2prreservation||mongoose.model('purchase2prreservation',reservationSchema);
const policySchema=new mongoose.Schema({colid:Number,departmentname:String,weeklylimit:{type:Number,min:0,default:2},allowjustification:{type:String,enum:['Yes','No'],default:'Yes'}},{timestamps:true});policySchema.index({colid:1,departmentname:1},{unique:true});
const Policy=mongoose.models.purchase2prioritylimit||mongoose.model('purchase2prioritylimit',policySchema);
const quotaSchema=new mongoose.Schema({colid:Number,departmentname:String,week:String,count:{type:Number,default:0}});quotaSchema.index({colid:1,departmentname:1,week:1},{unique:true});
const Quota=mongoose.models.purchase2urgentquota||mongoose.model('purchase2urgentquota',quotaSchema);
async function next(colid){const year=new Date().getFullYear();const row=await Counter.findOneAndUpdate({colid,year},{$inc:{serial:1}},{upsert:true,new:true});const prnumber=`PR/${year}/${String(row.serial).padStart(4,'0')}`;await Reservation.create({colid,prnumber});return prnumber;}
async function save(Model,key,payload,id,externalSession){
 if(payload.attachments && (!Array.isArray(payload.attachments)||payload.attachments.some(f=>!/^https:\/\//i.test(String(f.url||'')))))throw Error('Invalid attachment links');
 const session=externalSession||await mongoose.startSession();let saved;
 const operation=async()=>{
 const old=id?await Model.findOne({_id:id,colid:payload.colid}).session(session).lean():null;if(id&&!old)throw Error('PR not found');
 const indent=key.includes('requisition')||key.includes('requisation');
 if(!old){const number=payload.prnumber||payload.reqid;const reservation=await Reservation.findOneAndUpdate({colid:payload.colid,prnumber:number,used:false},{$set:{used:true}},{new:true,session});if(!reservation)throw Error('Request the next PR number before creating a requisition');payload.prnumber=number;if(indent){payload.reqid=number;payload.requestno=number;}payload.requestdate=new Date();payload.reqdate=new Date();payload.requesttime=new Date().toISOString();}
 else {for(const field of ['prnumber','reqid','requestno','requestdate','reqdate','createdAt','requesttime'])if(old[field]!==undefined)payload[field]=old[field];}
 const priority=payload.priority||old?.priority||'Normal';if(!['Normal','Urgent','Critical'].includes(priority))throw Error('Select Normal, Urgent or Critical');payload.priority=priority;
 const department=String(payload.departmentname||old?.departmentname||'').trim();
 if(priority==='Urgent'&&(!old?.priorityquotaweek)){
 if(!department)throw Error('Select department for Urgent PR');
 const now=new Date(),day=now.getUTCDay();now.setUTCDate(now.getUTCDate()-((day+6)%7));const week=now.toISOString().slice(0,10);
 const policy=await Policy.findOne({colid:payload.colid,departmentname:department}).session(session).lean()||{weeklylimit:2,allowjustification:'Yes'};
 const start=new Date(`${week}T00:00:00Z`),end=new Date(start.getTime()+7*86400000);
 const existingCount=await require('../Models/storeprrequestds2').countDocuments({colid:payload.colid,departmentname:department,priority:'Urgent',createdAt:{$gte:start,$lt:end}}).session(session);
 await Quota.updateOne({colid:payload.colid,departmentname:department,week},{$setOnInsert:{count:existingCount}},{upsert:true,session});
 const used=await Quota.findOneAndUpdate({colid:payload.colid,departmentname:department,week,count:{$lt:policy.weeklylimit}},{$inc:{count:1}},{new:true,session});
 if(!used){if(policy.allowjustification!=='Yes'||!String(payload.priorityjustification||'').trim())throw Error(`Urgent PR weekly limit (${policy.weeklylimit}) reached. Executive review or justification is required.`);payload.priorityoverride='Justification';}
 payload.priorityquotaweek=week;
 }
 saved=old?await Model.findOneAndUpdate({_id:id,colid:payload.colid},{$set:payload},{new:true,runValidators:true,session}):(await Model.create([payload],{session}))[0];
 };
 try{if(externalSession)await operation();else await session.withTransaction(operation);}finally{if(!externalSession)await session.endSession();}return saved;
}
module.exports={next,save,Policy};
