const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  colid: { type:Number,required:true,index:true }, kind:{type:String,enum:['agent','publisher'],required:true},
  partnerid:{type:mongoose.Schema.Types.ObjectId,required:true}, partner:String, partneremail:String,
  agent:String, agentemail:String, agentid:mongoose.Schema.Types.ObjectId,
  publisher:String, publisheremail:String, publisherid:mongoose.Schema.Types.ObjectId,
  academicyear:{type:String,required:true}, program:{type:String,required:true}, programcode:{type:String,required:true},
  amount:{type:Number,required:true,min:0}, user:String
},{timestamps:true});
schema.index({colid:1,kind:1,partnerid:1,academicyear:1,programcode:1},{unique:true});
module.exports = mongoose.models.crm2partnerpaymentds || mongoose.model('crm2partnerpaymentds',schema);
