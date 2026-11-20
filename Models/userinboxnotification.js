const mongoose=require('mongoose');
const schema=new mongoose.Schema({colid:Number,recipient:String,title:String,text:String,filelink:String,link:String,read:{type:Boolean,default:false}},{timestamps:true});
schema.index({colid:1,recipient:1,createdAt:-1});
module.exports=mongoose.models.userinboxnotification||mongoose.model('userinboxnotification',schema);
