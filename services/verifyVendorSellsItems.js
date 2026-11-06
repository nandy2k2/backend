const Vendor=require('../Models/vendords2'),Mapping=require('../Models/vendoritemds2'),Item=require('../Models/itemmasterds2');
async function verifyVendorSellsItems(colid,vendorid,items,session=null){
 if(!vendorid||!await Vendor.findOne({colid,_id:vendorid}).session(session).lean())throw Error('Select a valid vendor from this institution');
 const mappings=await Mapping.find({colid,vendorid:String(vendorid),verified:'Yes',status:{$not:/^(inactive|disabled|no)$/i}}).session(session).lean();
 for(const line of items){const query={colid};if(line.itemid)query._id=line.itemid;else if(line.itemcode)query.itemcode=line.itemcode;else if(line.itemname)query.itemname=line.itemname;else throw Error('Select identifiable items from Item Master');const matches=await Item.find(query).session(session).lean();if(matches.length!==1)throw Error(`Item Master match is missing or ambiguous: ${line.itemname||line.itemcode}`);const item=matches[0];Object.assign(line,{itemid:String(item._id),itemcode:item.itemcode,itemname:item.itemname,category:item.category,unit:item.unit||line.unit});const allowed=mappings.some(m=>m.mappingtype==='Category'?m.category&&m.category===item.category:String(m.itemid||'')===String(item._id)||m.itemcode&&m.itemcode===item.itemcode);if(!allowed)throw Error(`Vendor is not verified to supply ${item.itemname||item.itemcode}. Add a verified Vendor-Item Catalog mapping first.`);}
 return true;
}
module.exports={verifyVendorSellsItems};
