const mongoose=require('mongoose');
const make=(name,fields)=>new mongoose.Schema({colid:{type:Number,required:true,index:true},...fields},{timestamps:true});
const batch=make('batch',{academicyear:{type:String,required:true},exam:String,examcode:{type:String,required:true},batch:{type:String,required:true},description:String,user:String,revision:{type:Number,default:0}});
batch.index({colid:1,academicyear:1,examcode:1,batch:1},{unique:true});
const member=make('member',{batchid:{type:mongoose.Schema.Types.ObjectId,required:true},academicyear:String,examcode:String,regno:{type:String,required:true},student:String,email:String,program:String,programcode:String,semester:String,regulation:String,user:String});
member.index({colid:1,academicyear:1,examcode:1,regno:1},{unique:true});
module.exports={Batch:mongoose.model('practicalbatchds',batch),Member:mongoose.model('practicalbatchmemberds',member)};
