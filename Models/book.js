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
    booktitle: {
        type: String,
        required: [true,'Please enter department'],
        unique: false
    },
    papertitle: {
        type: String,
        required: [true,'Please enter title'],
        unique: false
    },
    proceeding: {
        type: String,
        required: [true,'Please enter journal'],
        unique: false
    },
    yop: {
        type: String,
        required: [true,'Please enter year of publication'],
        unique: false
    },
    issn: {
        type: String,
        required: [true,'Please enter issn'],
        unique: false
    },
    publisher: {
        type: String,
        required: [true,'Please enter article link'],
        unique: false
    },
    status1: {
        type: String
    },
    comments: {
        type: String
    },
    conferencename: {
        type: String
    },
    level: {
        type: String
    },
    type: {
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
    
    colid: {
        type: Number,
        required: [true,'Please enter colid']
    },
    affiliated: {
        type: String,
        required: [true,'Please enter if ugc listed'],
        unique: false
    }
})
//
const Book=mongoose.model('Book',bookschema);

module.exports=Book;
