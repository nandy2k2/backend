const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  colid: {type:Number,required:true},
  costcenter: {type:String,required:true,trim:true},
  description: String,
  institution: {type:String,required:true,trim:true}
}, {timestamps:true});
schema.index({colid:1,costcenter:1},{unique:true});
module.exports = mongoose.model("financecostcenterds",schema);
