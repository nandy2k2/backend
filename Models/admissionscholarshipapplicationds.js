const mongoose=require('mongoose');
const schema=new mongoose.Schema({
  ruleamount:Number,
  sourcekind:String,sourceconfigurationid:mongoose.Schema.Types.ObjectId,sourcefeecategory:String,
  colid:{type:Number,required:true},studentid:{type:mongoose.Schema.Types.ObjectId,required:true},regno:{type:String,required:true},
  scholarshipid:{type:mongoose.Schema.Types.ObjectId,required:true},sourceledgerid:{type:mongoose.Schema.Types.ObjectId,required:true},ledgerid:{type:mongoose.Schema.Types.ObjectId,required:true},
  scholarship:String,scholarshiptype:String,semester:String,academicyear:String,programcode:String,sourcefeeitem:String,base:{type:Number,min:0},amount:{type:Number,min:0},user:String,source:String
},{timestamps:true});
schema.index({colid:1,regno:1,scholarshipid:1,sourceledgerid:1},{unique:true});
schema.index({colid:1,sourceledgerid:1});
module.exports=mongoose.models.admissionscholarshipapplicationds || mongoose.model('admissionscholarshipapplicationds',schema);
