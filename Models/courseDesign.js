const mongoose=require('mongoose');
const assignment=require('./workloadassignmentds').schema.clone();
assignment.add({coursemapid:String,facultyid:String,startdate:{type:String,required:true},enddate:{type:String,required:true}});
const Assignment=mongoose.model('coursedesignassignment',assignment);
const Workflow=mongoose.model('coursedesignworkflow',new mongoose.Schema({colid:{type:Number,unique:true},approvers:[{userid:String,name:String,email:String}]},{timestamps:true}));
const submission=new mongoose.Schema({
 colid:{type:Number,required:true,index:true},assignmentid:{type:mongoose.Schema.Types.ObjectId,required:true},owner:{type:String,required:true},
 title:String,content:String,documents:[{name:String,url:String}],status:{type:String,enum:['Draft','Submitted','Approved','Rejected'],default:'Draft'},
 step:{type:Number,default:0},approvers:[{userid:String,name:String,email:String}],submittedat:Date,approvedat:Date,
 history:[{level:Number,decision:String,remarks:String,by:String,date:Date}]
},{timestamps:true});
submission.index({colid:1,assignmentid:1},{unique:true});
module.exports={Assignment,Workflow,Submission:mongoose.model('coursedesignsubmission',submission)};
