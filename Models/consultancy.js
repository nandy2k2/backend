const mongoose=require('mongoose');

const consultancyschema = new mongoose.Schema({
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
        required: [true,'Please enter year'],
        unique: false
    },
    duration: {
        type: String
    },
    consultant: {
        type: String,
        required: [true,'Please enter consultant name '],
        unique: false
    },
    advisor: {
        type: String,
        required: [true,'Please enter the name of advisor'],
        unique: false
    },
    department: {
        type: String
    },
    trainees: {
        type: Number
    },
    title: {
        type: String
    },
    role: {
        type: String
    },
    agency: {
        type: String,
        required: [true,'Please enter agency name'],
        unique: false
    },
    
    contact: {
        type: Number,
        required: [true,'Please enter contact details'],
        unique: false
    },
    
    revenue: {
        type: Number,
        required: [true,'Please enter the revenue '],
        unique: false
    },

    status1: {
        type: String,
        required: [true,'Please enter the status'],
        unique: false
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
    

    comments: {
        type: String,
        required: [true,'Please enter the comments'],
        unique: false
    }
})
//
const Consultancy=mongoose.model('Consultancy',consultancyschema);

module.exports=Consultancy;

