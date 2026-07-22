const mongoose = require('mongoose');

const scholarshipdsschema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter name']
    },
    user: {
        type: String,
        required: [true, 'Please enter user']
    },
    colid: {
        type: Number,
        required: [true, 'Please enter colid']
    },
    scholarshipname: {
        type: String,
        required: [true, 'Please enter scholarshipname']
    },
    amount: {
        type: Number,
        required: [true, 'Please enter amount']
    },
    status: {
        type: String,
    },
    category: {
        type: String,
    },
    program: {
        type: String,
    },
    programcode: {
        type: String,
    },
    gender: {
        type: String,
    },
    category: {
        type: String,
    },
    merit: {
        type: String,
    },
    cgpa: {
        type: Number,
    },
    incomegroup: {
        type: String,
    },
    applicationtype: {
        type: String,
        default: "Internal"
    },
    applicationwebsite: {
        type: String,
    },
    startdate: {
        type: String,
    },
    enddate: {
        type: String,  
    },
    createdat: {
        type: Date,
        default: Date.now
    }
});

const scholarshipds = mongoose.model('scholarshipds', scholarshipdsschema);

module.exports = scholarshipds;
