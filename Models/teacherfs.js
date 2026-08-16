const mongoose=require('mongoose');

const teacherfsschema = new mongoose.Schema({
    name: {
        type: String,
        required: [true,'Please enter name']
    },
    user: {
        type: String,
        required: [true,'Please enter user'],
        unique: false
    },
    colid: {
        type: Number,
        required: [true,'Please enter colid']
    },
    year: {
        type: String,
        required: [true,'Please enter academic year'],
        unique: false
    },
    tname: {
        type: String,
        required: [true,'Please enter faculty name'],
        unique: false
    },
    workshop: {
        type: String,
        required: [true,'Please enter name of the workshop/conference attended'],
        unique: false
    },
    profbody: {
        type: String,
        required: [true,'Please enter the name of professional body'],
        unique: false
    },
    amount: {
        type: Number,
        required: [true,'Please enter amount received(in INR)'],
        unique: false
    },
    source: {
        type: String
    },
    level: { type: String },
    award: { type: String },
    purpose: { type: String },
    duration: { type: String },
    status1: {
        type: String,
        required: [true,'Please enter the status'],
        unique: false
    },

    comments: {
        type: String,
        required: [true,'Please enter the comments'],
        unique: false
    },
    doclink: { type: String },
    filelink: { type: String },
    documentocrtext: { type: String },
    submissionstatus: { type: String, default: "Submitted" },
    documentstatus: { type: String, default: "Blank" },
    aivalidationstatus: { type: String },
    overallstatus: { type: String, default: "Submitted" },
    approvercomment: { type: String },
    usercomment: { type: String },
    aivalidationcomment: { type: String },
    accreditationframework: { type: String }
})
//
const TeacherFinancialSupport=mongoose.model('TeacherFinancialSupport',teacherfsschema);

module.exports=TeacherFinancialSupport;

