const mongoose=require('mongoose');
const jwt=require('jsonwebtoken');
async function grantsForRequest(req){
  let identity;
  try{identity=jwt.verify(String(req.get('authorization')||req.query?.token||'').replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}catch{return null;}
  const colid=Number(identity.colid);
  if(!colid||!identity.user)return null;
  const actor=await require('../Models/user').findOne({colid,email:identity.user}).select('role email').lean();
  if(!actor)return null;
  return {actor,colid,rows:await active(actor,colid)};
}
async function active(actor,colid){
  const Model=mongoose.models.temporaryaccessrequest;
  if(!Model)return [];
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return Model.find({colid,ownerid:String(actor._id),status:'Approved',start:{$lte:day},$or:[{permanent:true},{permanent:{$ne:true},end:{$gte:day}}]}).select('group pages').lean();
}
async function hasPage(actor,path){
  const paths=Array.isArray(path)?path:[path];
  const rows=await active(actor,actor.colid);
  return rows.some(row=>row.pages.some(page=>paths.includes(page.path)));
}
module.exports={grantsForRequest,hasPage};
