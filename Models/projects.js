const mongoose=require('mongoose');

const bookschema = new mongoose.Schema({
    name: {
        type: String,
        required: [true,'Please enter name']
    },
    user: {
        type: String,
        required: [true,'Please enter user'],
        unique: false
    },
    project: {
        type: String,
        required: [true,'Please enter project'],
        unique: false
    },
    agency: {
        type: String,
        required: [true,'Please enter agency'],
        unique: false
    },
    type: {
        type: String,
        required: [true,'Please enter type'],
        unique: false
    },
    yop: {
        type: String,
        required: [true,'Please enter year of award'],
        unique: false
    },
    department: {
        type: String,
        required: [true,'Please enter department'],
        unique: false
    },
    funds: {
        type: Number,
        required: [true,'Please enter funds'],
        unique: false
    },
    colid: {
        type: Number,
        required: [true,'Please enter colid']
    },
    status1: {
        type: String
    },
    comments: {
        type: String
    },
    level: {
        type: String
    },
    doclink: {
        type: String
    },
    filelink: { type: String },
    documentocrtext: { type: String },
    submissionstatus: { type: String, default: "Submitted" },
    documentstatus: { type: String, default: "Blank" },
    aivalidationstatus: { type: String },
    overallstatus: { type: String, default: "Submitted" },
    approvercomment: { type: String },
    usercomment: { type: String },
    aivalidationcomment: { type: String },
    accreditationframework: { type: String },
    duration: {
        type: String,
        required: [true,'Please enter duration'],
        unique: false
    }
})
//
const Project=mongoose.model('Project',bookschema);

module.exports=Project;
