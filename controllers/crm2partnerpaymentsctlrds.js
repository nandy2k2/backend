const router=require('express').Router();
const jwt=require('jsonwebtoken');
const User=require('../Models/user');
const Program=require('../Models/mprograms');
const {masterModels}=require('../Models/crm2ds');
const Rate=require('../Models/crm2partnerpaymentds');
const service=require('../services/crm2PartnerPayments');
const text=value=>String(value??'').trim(), id=value=>/^[a-f\d]{24}$/i.test(text(value));
const wrap=fn=>async(req,res)=>{
  try{
    const input={...req.query,...req.body};
    const token=String(req.get?.('authorization') || input.token || '').replace(/^Bearer\s+/i,'');
    const identity=req.user?.email?{user:req.user.email,colid:req.user.colid}:jwt.verify(token,process.env.JWT_SECRET);
    req.colid=Number(identity.colid);req.actor=await User.findOne({colid:req.colid,email:String(identity.user || identity.email || '').toLowerCase(),role:{$not:/^Student$/i}}).select('name email role').lean();
    if(!req.actor || !(req.colid>0)) throw Error('Valid non-student login is required');
    req.kind=text(req.params.kind);if(!['agent','publisher'].includes(req.kind))throw Error('Invalid partner type');
    req.partnerRole=/^(agent|publisher)$/i.test(req.actor.role);await fn(req,res);
  }catch(error){res.status(400).json({message:error.code===11000?'A rate already exists for this partner, year and program':error.message});}
};
const admin=req=>{if(req.partnerRole)throw Error('Partner accounts cannot edit payment configurations');};
router.get('/:kind/options',wrap(async(req,res)=>{
  const match={colid:req.colid,status:'Active'};
  if(req.partnerRole)match.email=req.actor.email.toLowerCase();
  const partners=await masterModels[req.kind].find(match).select('name email userid').sort({name:1}).lean();
  const years=await Program.distinct('year',{colid:req.colid});
  res.json({partners,years:years.filter(Boolean).sort().reverse()});
}));
router.get('/:kind/configurations',wrap(async(req,res)=>{
  admin(req);const match={colid:req.colid,kind:req.kind};
  for(const field of ['academicyear','programcode'])if(text(req.query[field]))match[field]=text(req.query[field]);
  if(id(req.query.partnerid))match.partnerid=req.query.partnerid;
  res.json({data:await Rate.find(match).sort({updatedAt:-1}).lean()});
}));
router.post('/:kind/configurations/save',wrap(async(req,res)=>{
  admin(req);const rows=req.body.rows || [req.body];if(!Array.isArray(rows)||!rows.length||rows.length>500)throw Error('Provide 1-500 configurations');
  let saved=0;
  for(const row of rows){
    const partnerid=row.partnerid || row[`${req.kind}id`];
    if(!id(partnerid)||!text(row.academicyear)||row.amount===''||row.amount==null||!Number.isFinite(Number(row.amount)*100)||Number(row.amount)<0)throw Error('Select partner, academic year and a nonnegative finite amount');
    const partner=await masterModels[req.kind].findOne({colid:req.colid,_id:partnerid,status:'Active'}).lean();
    const program=await Program.findOne({colid:req.colid,year:text(row.academicyear),programcode:text(row.programcode)}).lean();
    if(!partner||!program)throw Error('Partner or program not found in this institution and year');
    const payload={colid:req.colid,kind:req.kind,partnerid:partner._id,partner:partner.name,partneremail:partner.email,academicyear:text(row.academicyear),program:program.program,programcode:program.programcode,amount:Math.round(Number(row.amount)*100)/100,user:req.actor.email};
    Object.assign(payload,{[req.kind]:partner.name,[`${req.kind}email`]:partner.email,[`${req.kind}id`]:partner._id});
    if(row._id){if(!id(row._id)||!await Rate.findOneAndUpdate({_id:row._id,colid:req.colid,kind:req.kind},{$set:payload},{runValidators:true,new:true}))throw Error('Configuration not found');}
    else await Rate.findOneAndUpdate({colid:req.colid,kind:req.kind,partnerid:partner._id,academicyear:payload.academicyear,programcode:payload.programcode},{$set:payload},{upsert:true,new:true,runValidators:true});
    saved++;
  }res.json({saved});
}));
router.post('/:kind/configurations/delete',wrap(async(req,res)=>{
  admin(req);const ids=req.body.ids;if(!Array.isArray(ids)||!ids.length||ids.length>500||!ids.every(id))throw Error('Select valid configurations');
  const result=await Rate.deleteMany({colid:req.colid,kind:req.kind,_id:{$in:ids}});res.json({deleted:result.deletedCount});
}));
router.get('/:kind/report',wrap(async(req,res)=>{
  const mine=req.query.mine==='true'||req.partnerRole;
  const year=text(req.query.academicyear);if(!year&&!mine)throw Error('Select academic year');
  if(req.partnerRole && req.actor.role.toLowerCase()!==req.kind)throw Error('This report is not available for your partner role');
  let partner;
  if(mine)partner=await masterModels[req.kind].findOne({colid:req.colid,email:req.actor.email.toLowerCase()}).lean();
  else{if(!id(req.query.partnerid))throw Error('Select partner');partner=await masterModels[req.kind].findOne({colid:req.colid,_id:req.query.partnerid}).lean();}
  const email=mine?req.actor.email:partner?.email;if(!email)throw Error('Partner not found');
  res.json({...await service.report({colid:req.colid,kind:req.kind,email,academicyear:year,partnerid:partner?._id}),partner:partner?{name:partner.name,email:partner.email}:{name:req.actor.name,email},academicyear:year});
}));
module.exports=router;
