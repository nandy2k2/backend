const Store=require('../Models/storemasterds2'),mongoose=require('mongoose');
async function normalize(payload){
 const raw=payload.storeid||payload.storeId, name=payload.storename||payload.store;
 if(!raw&&!name)return;
 const clauses=[];if(mongoose.isValidObjectId(raw))clauses.push({_id:raw});if(typeof name==='string'&&name.trim())clauses.push({storename:name.trim()});
 const store=clauses.length?await Store.findOne({colid:Number(payload.colid),$or:clauses}).lean():null;
 if(!store)throw Error('Select a valid store from Store Master (storemasterds2)');
 payload.storeid=String(store._id);payload.storename=store.storename;
 if(payload.storeId!==undefined)payload.storeId=String(store._id);
 if(payload.store!==undefined)payload.store=store.storename;
 return store;
}
async function readQuery(Model,source,query){
 let filters;try{filters=typeof source.filters==='string'?JSON.parse(source.filters):source.filters||[];}catch{filters=[];}
 const selected=Array.isArray(filters)?filters.find(f=>['storeid','storeId'].includes(f.field)&&f.value):null;
 if(!selected||!mongoose.isValidObjectId(selected.value))return query;
 const store=await Store.findOne({_id:selected.value,colid:Number(source.colid)}).lean();if(!store)throw Error('Selected store is not in Store Master');
 const clauses=[];for(const [field,value] of [['storeid',String(store._id)],['storeId',String(store._id)],['storename',store.storename],['store',store.storename]])if(value&&(Model.schema.path(field)||Model.schema.options.strict===false))clauses.push({[field]:value});
 delete query.storeid;delete query.storeId;if(clauses.length)(query.$and ||= []).push({$or:clauses});return query;
}
async function canonicalRows(colid,rows){
 const stores=await Store.find({colid}).lean();
 return rows.map(row=>{const store=stores.find(s=>String(s._id)===String(row.storeid||row.storeId||'')||s.storename&&[row.storename,row.store].includes(s.storename));return store?{...row,storeid:String(store._id),storename:store.storename,...(row.store!==undefined?{store:store.storename}:{}),storelocation:store.location,storephone:store.phone,storemanager:store.storemanager}:row;});
}
module.exports={normalize,readQuery,canonicalRows};
