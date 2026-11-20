const mongoose=require("mongoose");
const schema=new mongoose.Schema({
 colid:{type:Number,required:true},semester:{type:String,trim:true,required:true},
 description:String,status:{type:String,default:"Active"},user:String
},{timestamps:true});
schema.index({colid:1,semester:1},{unique:true});
module.exports=mongoose.model("semestermasterds",schema);
