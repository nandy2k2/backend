const router=require('express').Router();
const jwt=require('jsonwebtoken');
const User=require('../Models/user');
const Scholarship=require('../Models/admissionscholarshipds');
const Program=require('../Models/mprograms');
const service=require('../services/admissionScholarshipApply');
const text=value=>String(value??'').trim();
const fields={students:['academicyear','admissionyear','regulation','program','programcode','semester','section','name','regno','email','rollno','gender','category','institution','department','quota','annualincome','freeshipcardholder'],scholarships:['scholarship','academicyear','program','programcode','semester','feecategory','feeitem','type','scholarshiptype','category','gender','merit','meritpercentage','value']};
const escape=value=>text(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const wrap=fn=>async(req,res)=>{
  try{
    const input={...req.query,...req.body},token=String(req.get?.('authorization')||input.token||'').replace(/^Bearer\s+/i,'');
    const identity=req.user?.email?{user:req.user.email,colid:req.user.colid}:jwt.verify(token,process.env.JWT_SECRET);
    req.colid=Number(identity.colid);req.actor=text(identity.user||identity.email).toLowerCase();
    if(!(req.colid>0)||!req.actor||!await User.exists({colid:req.colid,email:req.actor,role:{$not:/^Student$/i}}))throw Error('Valid non-student login is required');
    await fn(req,res);
  }catch(error){res.status(400).json({message:error.code===11000?'A selected scholarship is already applied. Reload matching items.':/replica set|Transaction numbers/i.test(error.message)?'Scholarship application requires MongoDB replica-set transactions; no partial entries were saved.':error.message});}
};
function queryFor(kind,colid,filters=[],search='') {
  if(!fields[kind]||!Array.isArray(filters)||filters.length>30)throw Error('Invalid filters');
  const Model=kind==='students'?User:Scholarship,query={colid,...(kind==='students'?{role:'Student'}:{active:'Yes'})},clauses=[];
  for(const filter of filters){
    if(!fields[kind].includes(filter.field))throw Error('Invalid filter field');
    if(!Array.isArray(filter.values)||filter.values.length>1000||filter.values.some(value=>!['string','number'].includes(typeof value)))throw Error('Select valid filter values');
    if(!filter.values.length)continue;
    const values=filter.values.map(value=>Model.schema.path(filter.field)?.instance==='Number'?Number(value):text(value));
    if(values.some(value=>typeof value==='number'&&!Number.isFinite(value)))throw Error('Invalid numeric filter');
    // Legacy scholarship type is Total even before the field was stored.
    if(kind==='scholarships'&&filter.field==='scholarshiptype'&&values.includes('Total'))clauses.push({$or:[{scholarshiptype:{$in:values}},{scholarshiptype:{$in:[null,'']}}]});
    else clauses.push({[filter.field]:{$in:values}});
  }
  if(search)clauses.push({$or:(kind==='students'?['name','email','regno','phone']:['scholarship','description','feeitem']).map(field=>({[field]:new RegExp(escape(text(search).slice(0,200)),'i')}))});
  if(clauses.length)query.$and=clauses;return query;
}
router.get('/metadata',wrap(async(req,res)=>res.json({fields})));
router.get('/careof-users',wrap(async(req,res)=>{
  const search=escape(text(req.query.search).slice(0,200));
  const query={colid:req.colid,...(search?{$or:[{name:new RegExp(search,'i')},{email:new RegExp(search,'i')}]}:{})};
  res.json({data:await User.find(query).select('name email').sort({name:1}).limit(50).lean()});
}));
router.post('/:kind/options',wrap(async(req,res)=>{
  const {kind}=req.params,field=text(req.body.field);if(!fields[kind]?.includes(field))throw Error('Invalid option field');
  const filters=req.body.filters || [];queryFor(kind,req.colid,filters);
  const search=text(req.body.search).slice(0,200);
  if(['program','programcode'].includes(field)){
    const match={colid:req.colid},years=filters.find(row=>row.field==='academicyear')?.values;
    if(years?.length)match.year={$in:years};
    if(search)match.$or=['program','programcode'].map(key=>({[key]:new RegExp(escape(search),'i')}));
    const programs=await Program.find(match).select('program programcode').sort({program:1}).limit(100).lean();
    const data=[...new Map(programs.filter(row=>row.program&&row.programcode).map(row=>[`${row.program}|${row.programcode}`,{label:`${row.program} (${row.programcode})`,value:row[field],programcode:row.programcode}])).values()];
    return res.json({data});
  }
  const Model=kind==='students'?User:Scholarship,match=queryFor(kind,req.colid,filters.filter(row=>row.field!==field));
  match[field]={$nin:[null,'']};
  if(search){if(Model.schema.path(field)?.instance==='Number')match.$expr={$regexMatch:{input:{$toString:`$${field}`},regex:escape(search),options:'i'}};else Object.assign(match[field],{$regex:escape(search),$options:'i'});}
  const values=(await Model.aggregate([{$match:match},{$group:{_id:`$${field}`}},{$sort:{_id:1}},{$limit:100}])).map(row=>row._id);
  if(kind==='scholarships'&&field==='scholarshiptype')values.push('Total');
  res.json({data:[...new Set(values.filter(value=>value!=null&&value!=='').map(String))].filter(value=>!search||value.toLowerCase().includes(search.toLowerCase())).sort().map(value=>({label:value,value}))});
}));
router.post('/:kind/search',wrap(async(req,res)=>{
  const {kind}=req.params,query=queryFor(kind,req.colid,req.body.filters || [],text(req.body.search)),Model=kind==='students'?User:Scholarship;
  const limit=Math.min(1000,Math.max(1,Number(req.body.limit)||1000));
  let cursor=Model.find(query);if(kind==='students')cursor=cursor.select(fields.students.join(' ')+' phone');
  const rows=await cursor.sort(kind==='students'?{name:1,_id:1}:{scholarship:1,_id:1}).limit(limit).lean();
  const total=await Model.countDocuments(query);
  res.json({data:kind==='scholarships'?rows.map(row=>({...row,scholarshiptype:row.scholarshiptype || 'Total'})):rows,total});
}));
router.post('/preview',wrap(async(req,res)=>res.json(await service.preview({colid:req.colid,studentids:req.body.studentids,scholarshipids:req.body.scholarshipids}))));
router.post('/apply',wrap(async(req,res)=>res.json(await service.apply({colid:req.colid,actor:req.actor,selections:req.body.selections,details:req.body.details}))));
module.exports={router,queryFor,fields};
