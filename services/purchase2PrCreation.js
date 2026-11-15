const mongoose=require('mongoose');
const counterSchema=new mongoose.Schema({_id:String,serial:Number});
const Counter=mongoose.models.purchase2prdailycounter||mongoose.model('purchase2prdailycounter',counterSchema);
const policySchema=new mongoose.Schema({colid:Number,departmentname:String,weeklylimit:{type:Number,min:0,default:2},allowjustification:{type:String,enum:['Yes','No'],default:'Yes'}},{timestamps:true});policySchema.index({colid:1,departmentname:1},{unique:true});
const Policy=mongoose.models.purchase2prioritylimit||mongoose.model('purchase2prioritylimit',policySchema);
const quotaSchema=new mongoose.Schema({colid:Number,departmentname:String,week:String,count:{type:Number,default:0}});quotaSchema.index({colid:1,departmentname:1,week:1},{unique:true});
const Quota=mongoose.models.purchase2urgentquota||mongoose.model('purchase2urgentquota',quotaSchema);
const dayFormat = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
function prefix(shortname, now) {
 const code=String(shortname||'').trim().toUpperCase();
 if(!/^[A-Z0-9]+$/.test(code))throw Error('Configure an alphanumeric institution short name for the selected store');
 const parts=Object.fromEntries(dayFormat.formatToParts(now).map(({type,value})=>[type,value]));
 return `PR_${code}_${parts.year}_${parts.month}_${parts.day}`;
}
async function resolveUnit(colid,storeid,session){
 if(!mongoose.isValidObjectId(storeid))throw Error('Select a store before generating the PR number');
 const Store=require('../Models/storemasterds2');
 const store=await Store.findOne({_id:storeid,colid}).session(session).lean() || await Store.findOne({legacystoreid:storeid,colid}).session(session).lean();
 const institution=store?.institutionid && await require('../Models/academicmasterinstitutionds').findOne({_id:store.institutionid,colid}).session(session).lean();
 return { institutionid: institution?._id, institutionname: institution?.institution, unitcode: institution?.shortname, departmentname: store?.departmentname, unitname: store?.unitname, address: store?.campusaddress, phone: store?.campusphone, email: store?.campusemail, gstin: store?.gstin, website: store?.website, logolink: store?.logolink };
}
async function storePrefix(colid,storeid,now,session){
 return prefix((await resolveUnit(colid,storeid,session)).unitcode,now);
}
async function poNumber(colid,unit,session,now=new Date()){
 return allocate(colid,prefix(unit.unitcode,now).replace(/^PR_/,'PO_'),session);
}
async function next(colid,storeid,now,session){
 const base=await storePrefix(colid,storeid,now,session);
 return allocate(colid,base,session);
}
async function allocate(colid,base,session){
 const row=await Counter.findOneAndUpdate({_id:JSON.stringify([colid,base])},{$inc:{serial:1}},{upsert:true,new:true,session});
 if(row.serial>999)throw Error(`Daily ${base.slice(0,2)} number limit (999) reached for this institution`);
 return `${base}_${String(row.serial).padStart(3,'0')}`;
}
async function save(Model,key,payload,id,externalSession){
 if(payload.attachments && (!Array.isArray(payload.attachments)||payload.attachments.some(f=>!/^https:\/\//i.test(String(f.url||'')))))throw Error('Invalid attachment links');
 const session=externalSession||await mongoose.startSession();let saved;
 const operation=async()=>{
 const old=id?await Model.findOne({_id:id,colid:payload.colid}).session(session).lean():null;if(id&&!old)throw Error('PR not found');
 const indent=key.includes('requisition')||key.includes('requisation');
 const now=new Date();
 if(payload.storeid || old?.storeid){
 const unit=await resolveUnit(payload.colid,payload.storeid||old.storeid,session);
 if(unit.unitcode){payload.storeunit=unit;payload.departmentname=unit.departmentname||payload.departmentname||old?.departmentname;}
 }
 if(!old || indent && old.reqstatus==='Draft' && payload.reqstatus && payload.reqstatus!=='Draft'){
 const number=await next(payload.colid,payload.storeid||old?.storeid,now,session);
 payload.prnumber=number;if(indent){payload.reqid=number;payload.requestno=number;}
 payload.requestdate=now;payload.reqdate=now;payload.requesttime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(now);
 } else {for(const field of ['prnumber','reqid','requestno','requestdate','reqdate','createdAt','requesttime'])if(old[field]!==undefined)payload[field]=old[field];}
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
async function preview(colid,storeid){
 const base=await storePrefix(colid,storeid,new Date(),null);
 const row=await Counter.findById(JSON.stringify([colid,base])).lean();
 const serial=(row?.serial||0)+1;
 if(serial>999)throw Error('Daily PR number limit (999) reached for this institution');
 return `${base}_${String(serial).padStart(3,'0')}`;
}
module.exports={save,Policy,prefix,preview,resolveUnit,poNumber};
