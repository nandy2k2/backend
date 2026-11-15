const router=require('express').Router(),mongoose=require('mongoose');
const Vendor=require('../Models/vendords2'),Mapping=require('../Models/vendoritemds2'),Item=require('../Models/itemmasterds2'),PR=require('../Models/storeprrequestds2'),PRItem=require('../Models/storeprrequestitemsds2');
const {verifyVendorSellsItems}=require('../services/verifyVendorSellsItems'),{calculatePoLine}=require('../utils/purchase2Amounts'),{compareQuotes}=require('../utils/purchase2Comparison');
const PO=require('../Models/storepoorderds2'), POItem=require('../Models/storepoitemsds2');
const {draft:isDraft}=require('../utils/purchase2PoRules');
const schema=new mongoose.Schema({colid:Number,prnumber:String,vendorid:String,vendor:String,paymentterms:String,lines:[mongoose.Schema.Types.Mixed],user:String},{timestamps:true});schema.index({colid:1,prnumber:1,vendorid:1},{unique:true});const Quote=mongoose.models.purchase2quotation||mongoose.model('purchase2quotation',schema);
const wrap=fn=>async(req,res)=>{try{req.actor=await require('../services/purchase2PoAccess').staff(req);req.colid=req.actor.colid;await fn(req,res);}catch(e){res.status(400).json({message:e.message});}};
router.get('/options',wrap(async(req,res)=>{const [vendors,categories,prs]=await Promise.all([Vendor.find({colid:req.colid}).select('vendorname name').sort({vendorname:1}).lean(),Item.distinct('category',{colid:req.colid}),PR.find({colid:req.colid,status:{$nin:['Rejected','Cancelled']}}).select('prnumber departmentname priority').sort({createdAt:-1}).lean()]);res.json({vendors,categories:categories.filter(Boolean),prs});}));
router.get('/mappings',wrap(async(req,res)=>res.json({data:await Mapping.find({colid:req.colid,...(req.query.vendorid?{vendorid:req.query.vendorid}:{})}).sort({vendorname:1,item:1}).lean()})));
router.post('/mappings/save',wrap(async(req,res)=>{const b=req.body,vendor=await Vendor.findOne({colid:req.colid,_id:b.vendorid}).lean();if(!vendor)throw Error('Select a vendor');const rows=[];for(const id of b.itemids||[]){const item=await Item.findOne({colid:req.colid,_id:id}).lean();if(!item)throw Error('Item not found');rows.push({mappingtype:'Item',itemid:String(item._id),item:item.itemname,itemcode:item.itemcode,category:item.category});}const categories=await Item.distinct('category',{colid:req.colid});for(const category of b.categories||[]){if(!categories.includes(category))throw Error('Select a category from Item Master');rows.push({mappingtype:'Category',category,item:''});}if(!rows.length)throw Error('Select items or categories');await Mapping.bulkWrite(rows.map(row=>({updateOne:{filter:{colid:req.colid,vendorid:String(vendor._id),mappingtype:row.mappingtype,...(row.mappingtype==='Item'?{itemid:row.itemid}:{category:row.category})},update:{$set:{...row,name:req.actor.name,user:req.actor.email,vendorname:vendor.vendorname||vendor.name,verified:b.verified==='Yes'?'Yes':'No',status:'Active'}},upsert:true}})));res.json({success:true});}));
router.post('/mappings/delete',wrap(async(req,res)=>{await Mapping.deleteMany({colid:req.colid,_id:{$in:req.body.ids||[]}});res.json({success:true});}));
router.get('/comparison',wrap(async(req,res)=>{const pr=await PR.findOne({colid:req.colid,prnumber:req.query.prnumber}).lean();if(!pr)throw Error('Select a PR');const items=await PRItem.find({colid:req.colid,prnumber:pr.prnumber}).lean(),quotes=await Quote.find({colid:req.colid,prnumber:pr.prnumber}).lean();const orders=(await PO.find({colid:req.colid,prnumber:pr.prnumber}).select("poid vendor postatus approvalStatus submittedtime approvedtime").lean()).map(po=>({...po,editable:isDraft(po)}));res.json({pr,items,quotes,orders,drafts:orders.filter(po=>po.editable),...compareQuotes(items,quotes)});}));
router.post('/quotation',wrap(async(req,res)=>{const b=req.body;const pr=await PR.findOne({colid:req.colid,prnumber:b.prnumber}).lean();if(!pr)throw Error('Select PR');const vendor=await Vendor.findOne({colid:req.colid,_id:b.vendorid}).lean();if(!vendor)throw Error('Select vendor');const items=await PRItem.find({colid:req.colid,prnumber:pr.prnumber}).lean();if(!Array.isArray(b.lines)||!b.lines.length)throw Error('Enter quotation items');const seen=new Set(),lines=b.lines.map(input=>{if(input.price===''||input.price==null)throw Error('Enter a unit rate for each quotation line');const item=items.find(i=>String(i._id)===String(input.pritemid));if(!item||seen.has(String(item._id)))throw Error('Invalid or duplicate PR line');seen.add(String(item._id));return {...calculatePoLine({quantity:item.quantity,price:input.price,discount:input.discount,discounttype:input.discounttype,gst:input.gst},true),pritemid:String(item._id),itemid:item.itemid,itemcode:item.itemcode,itemname:item.itemname,unit:item.unit};});await verifyVendorSellsItems(req.colid,vendor._id,lines);await Quote.findOneAndUpdate({colid:req.colid,prnumber:pr.prnumber,vendorid:String(vendor._id)},{$set:{vendor:vendor.vendorname||vendor.name,paymentterms:String(b.paymentterms||''),lines,user:req.actor.email}},{upsert:true,runValidators:true});res.json({success:true});}));
router.get('/draft-po/:id',wrap(async(req,res)=>{
 const header=await PO.findOne({colid:req.colid,_id:req.params.id}).lean();
 if(!header||!isDraft(header))throw Error('This PO is no longer a draft');
 require('../services/purchase2PoAccess').canEdit(req.actor,header);
 const items=await POItem.find({colid:req.colid,poid:header.poid}).lean();
 res.json({header,items});
}));
router.post('/draft-po',wrap(async(req,res)=>{
 const {prnumber,vendorid}=req.body;
 if(typeof prnumber!=='string'||typeof vendorid!=='string'||!mongoose.isValidObjectId(vendorid))throw Error('Select an overall L1 quotation');
 const result=await require('../services/purchase2PrPo').create(req.colid,{prnumber,user:req.actor.email,name:req.actor.name},async session=>{
  const items=await PRItem.find({colid:req.colid,prnumber}).session(session).lean();
  const quotes=await Quote.find({colid:req.colid,prnumber}).session(session).lean();
  const quote=quotes.find(row=>row.vendorid===vendorid);
  if(!items.length||!quote||!compareQuotes(items,quotes).totals.some(row=>row.id===vendorid&&row.l1))throw Error('Select a complete quotation ranked overall L1');
  return {header:{vendorid,terms:quote.paymentterms},items:items.map(item=>({...quote.lines.find(line=>String(line.pritemid)===String(item._id)),quantity:item.quantity}))};
 });
 res.status(201).json(result);
}));
module.exports=router;
