const mongoose=require('mongoose');

const mcoursematerialschema = new mongoose.Schema({
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
type: String
},
course: {
type: String
},
coursecode: {
type: String
},
slideno: {
type: Number
},
title: {
type: String
},
section: {
type: String
},
description: {
type: String
},
imagelink: {
type: String
},
voicetext: {
type: String
},
doclink: {
type: String
},
type: {
type: String
},
mode: {
type: String
},
status1: {
        type: String
    },
    comments: {
        type: String
    }
})
//
const mcoursematerial=mongoose.model('mcoursematerial',mcoursematerialschema);

module.exports=mcoursematerial;
