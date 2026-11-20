exports.run=async(req,res)=>{
  let identity;
  try{identity=require('jsonwebtoken').verify(String(req.get('authorization')||'').replace(/^Bearer\s+/i,''),process.env.JWT_SECRET);}
  catch{return res.sendStatus(401);}
  try{
    const colid=Number(identity.colid);
    const actor=await require('../Models/user').findOne({colid,email:identity.user}).select('role').lean();
    if(!actor||/^student$/i.test(actor.role))return res.sendStatus(403);
    if(!/^all$/i.test(actor.role)&&!(await require('../Models/menuaccessds').exists({colid,role:actor.role,path:'/examrollrulescheck',access:'Allow'})||await require('../services/additionalAccess').hasPage({...actor,colid},'/examrollrulescheck')))return res.sendStatus(403);
    const ids=Array.isArray(req.body.ids)?[...new Set(req.body.ids)]:[];
    if(ids.some(id=>typeof id!=='string'||!require('mongoose').isValidObjectId(id)))throw Error('Invalid selected examroll rows');
    if(!ids.length&&(!req.body.academicyear||!req.body.examcode))return res.status(400).json({message:'Select rows, or select academic year and exam code before reconciling'});
    const query={colid};
    for(const key of ['academicyear','examcode','regulation','program','programcode','semester','course','coursecode','section','regno']){
      if(req.body[key]!=null){if(typeof req.body[key]!=='string')throw Error('Invalid filter');if(req.body[key].trim())query[key]=req.body[key].trim();}
    }
    if(ids.length)query._id={$in:ids};
    res.json(await require('../services/examRollPayments').reconcile(query));
  }catch(e){res.status(400).json({message:e.message});}
};
