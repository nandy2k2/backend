const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../Models/user');
const Program = require('../Models/mprograms');
const { Lead, masterModels } = require('../Models/crm2ds');
const { Assignment } = require('../Models/crm2programds');
const schema = new mongoose.Schema({ colid: { type:Number,required:true }, academicyear: { type:String,required:true }, program:String, programcode: {type:String,required:true}, capacity:{type:Number,min:0,required:true} },{timestamps:true});
schema.index({colid:1,academicyear:1,programcode:1},{unique:true});
const Capacity = mongoose.models.crm2seatcapacity || mongoose.model('crm2seatcapacity',schema);
const wrap = fn => async(req,res)=>{try{const token=String(req.get('authorization')||req.body?.token||req.query.token||'').replace(/^Bearer\s+/i,'');const identity=require('jsonwebtoken').verify(token,process.env.JWT_SECRET);req.colid=Number(identity.colid);const user=await User.findOne({colid:req.colid,email:String(identity.user||identity.email).toLowerCase(),role:{$not:/^(Student|Agent|Publisher)$/i}}).select('_id').lean();if(!user)throw Error('Authorized staff login required');await fn(req,res);}catch(e){res.status(400).json({message:e.code===11000?'Capacity already exists for this program and year':e.message});}};
router.get('/options',wrap(async(req,res)=>{const years=await Program.distinct('year',{colid:req.colid});const programs=await Program.find({colid:req.colid,...(req.query.academicyear?{year:req.query.academicyear}:{})}).select('program programcode year').sort({program:1}).lean();res.json({years:years.filter(Boolean).sort().reverse(),programs});}));
router.get('/capacities',wrap(async(req,res)=>res.json({data:await Capacity.find({colid:req.colid,...(req.query.academicyear?{academicyear:req.query.academicyear}:{})}).sort({program:1}).lean()})));
router.post('/capacities/save',wrap(async(req,res)=>{
  const rows=req.body.rows;if(!Array.isArray(rows)||!rows.length)throw Error('Select programs and capacity');
  const operations=[];for(const row of rows){if(!row.academicyear||!String(row.capacity).trim()||!Number.isInteger(Number(row.capacity))||Number(row.capacity)<0)throw Error('Enter academic year and non-negative whole-number capacity');const program=await Program.findOne({colid:req.colid,year:row.academicyear,programcode:String(row.programcode)}).lean();if(!program)throw Error('Program not found in selected year');operations.push({updateOne:{filter:{colid:req.colid,academicyear:row.academicyear,programcode:program.programcode},update:{$set:{program:program.program,capacity:Number(row.capacity)}},upsert:true}});}await Capacity.bulkWrite(operations);res.json({success:true});
}));
router.post('/capacities/delete',wrap(async(req,res)=>{const ids=req.body.ids;if(!Array.isArray(ids)||ids.some(id=>!mongoose.isValidObjectId(id)))throw Error('Select valid records');await Capacity.deleteMany({colid:req.colid,_id:{$in:ids}});res.json({success:true});}));
router.get('/report',wrap(async(req,res)=>{
  const year=String(req.query.academicyear||'').trim();if(!year)throw Error('Select academic year');
  const assignments=await Assignment.find({colid:req.colid,academicyear:year}).select('leadid program programcode admitted').lean();
  const leads=await Lead.find({colid:req.colid,$or:[{academicyear:year},{'programsinterested.academicyear':year},{_id:{$in:assignments.map(x=>x.leadid)}}]}).select('name email phone academicyear counsellorname counselloremail agentname agentemail pipeline source admitted admissionoffice program programcode programsinterested').lean();
  const byLead=new Map();for(const a of assignments){const k=String(a.leadid);if(!byLead.has(k))byLead.set(k,[]);byLead.get(k).push(a);}
  const rows=leads.map(lead=>{const linked=byLead.get(String(lead._id))||[];const interested=(lead.programsinterested||[]).filter(p=>p.academicyear===year);return {...lead,programcodes:[...new Set([...linked,...interested,...(lead.academicyear===year&&lead.programcode?[lead]:[])].map(p=>String(p.programcode)))],admittedcodes:lead.admitted==='Yes'?[...new Set((linked.some(p=>p.admitted==='Yes')?linked.filter(p=>p.admitted==='Yes'):lead.academicyear===year&&lead.programcode?[lead]:[]).map(p=>String(p.programcode)))]:[]};});
  const [capacities,programs,counselors,agents]=await Promise.all([Capacity.find({colid:req.colid,academicyear:year}).lean(),Program.find({colid:req.colid,year}).select('program programcode').lean(),User.find({colid:req.colid,$or:[{role:/^counsel+or$/i},{email:{$in:leads.map(l=>l.counselloremail).filter(Boolean)}}]}).select('name email').lean(),masterModels.agent.find({colid:req.colid}).select('name email').lean()]);
  res.json({leads:rows,capacities,programs,counselors,agents});
}));
module.exports=router;
