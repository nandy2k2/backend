const router=require('express').Router(),service=require('../services/purchase2PrCreation');
const upload=require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:15*1024*1024}});
const wrap=fn=>async(req,res)=>{try{req.colid=Number(req.body?.colid||req.query.colid);if(!(req.colid>0))throw Error('Institution ID required');await fn(req,res);}catch(e){res.status(400).json({message:e.message});}};
router.get('/prnumber/next',wrap(async(req,res)=>res.json({prnumber:await service.next(req.colid)})));
router.post('/pr-attachment',upload.single('file'),wrap(async(req,res)=>{
 const f=req.file;if(!f||!['application/pdf','image/jpeg','image/png'].includes(f.mimetype))throw Error('Only PDF, JPG and PNG attachments are supported');
 const valid=f.mimetype==='application/pdf'?f.buffer.subarray(0,5).toString()==='%PDF-':f.mimetype==='image/png'?f.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):f.buffer[0]===255&&f.buffer[1]===216;
 if(!valid)throw Error('Invalid file contents');
 const cfg=await require('../Models/awsconfig').findOne({colid:req.colid,type:/^aws$/i,default:/^yes$/i}).lean();if(!cfg?.bucket||!cfg?.username||!cfg?.password||!cfg?.region)throw Error('Default AWS configuration is required');
 const filename=require('path').basename(f.originalname).replace(/[^\w.\- ]/g,'_'),key=`${req.colid}/purchase2/pr/${require('crypto').randomBytes(16).toString('hex')}-${filename}`;
 await new (require('aws-sdk').S3)({accessKeyId:cfg.username,secretAccessKey:cfg.password,region:cfg.region}).putObject({Bucket:cfg.bucket,Key:key,Body:f.buffer,ContentType:f.mimetype}).promise();res.json({url:`https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`});
}));
router.get('/priority-limitations',wrap(async(req,res)=>res.json({data:await service.Policy.find({colid:req.colid}).lean()})));
router.post('/priority-limitations',wrap(async(req,res)=>{const departmentname=String(req.body.departmentname||'').trim(),weeklylimit=Number(req.body.weeklylimit);if(!departmentname||!Number.isInteger(weeklylimit)||weeklylimit<0)throw Error('Enter department and non-negative weekly limit');await service.Policy.findOneAndUpdate({colid:req.colid,departmentname},{$set:{weeklylimit,allowjustification:req.body.allowjustification==='No'?'No':'Yes'}},{upsert:true,runValidators:true});res.json({success:true});}));
router.post('/priority-limitations/delete',wrap(async(req,res)=>{await service.Policy.deleteMany({colid:req.colid,_id:{$in:req.body.ids||[]}});res.json({success:true});}));
router.get('/item-search',wrap(async(req,res)=>{const q={colid:req.colid};const search=String(req.query.search||'').trim();if(search){const regex=new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');q.$or=['itemname','itemcode','category'].map(field=>({[field]:regex}));}res.json({data:await require('../Models/itemmasterds2').find(q).sort({itemname:1}).limit(50).lean()});}));
module.exports=router;
