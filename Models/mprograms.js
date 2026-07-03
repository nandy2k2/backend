const mongoose=require('mongoose');

const mprogramsschema = new mongoose.Schema({
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
program: {
type: String
},
programcode: {
type: String
},
type: {
type: String
},
level: {
type: String
},
institution: {
type: String
},
department: {
type: String
},
durationinyear: {
type: Number
},
typeofsession: {
type: String
},
introductionyear: {
type: String
},
discontinueyear: {
type: String
},
lastrevisionyear: {
type: String
},
Order: {
type: Number
},
status1: {
        type: String
    },
    comments: {
        type: String
    }
})
//
const mprograms=mongoose.model('mprograms',mprogramsschema);

module.exports=mprograms;
