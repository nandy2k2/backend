const mongoose=require('mongoose');

const feesschema = new mongoose.Schema({
    name: {
        type: String,
        required: [true,'Please enter name']
    },
    user: {
        type: String,
        required: [true,'Please enter user'],
        unique: false
    },
    programcode: {
        type: String,
        required: [true,'Please enter programcode'],
        unique: false
    },
    program: {
        type: String,
        unique: false
    },
    regulation: {
        type: String,
        unique: false
    },
    major: {
        type: String,
        unique: false
    },
    minor: {
        type: String,
        unique: false
    },
    IDC: {
        type: String,
        unique: false
    },
    gender: {
        type: String,
        unique: false
    },
    Medium: {
        type: String,
        unique: false
    },
    feebook: {
        type: String,
        unique: false
    },
    cashbook: {
        type: String,
        unique: false
    },
    feegroup: {
        type: String,
        required: [true,'Please enter feegroup'],
        unique: false
    },
    semester: {
        type: String,
        required: [true,'Please enter semester'],
        unique: false
    },
    feeeitem: {
        type: String,
        required: [true,'Please enter feeitem'],
        unique: false
    },
    academicyear: {
        type: String,
        required: [true,'Please enter academicyear'],
        unique: false
    },
    feecategory: {
        type: String,
        required: [true,'Please enter feecategory'],
        unique: false
    },
    studtype: {
        type: String
    },
    domicile: {
        type: String
    },
    feetype: {
        type: String
    },
    classdate: {
        type: Date,
        required: [true,'Please enter duedate'],
        unique: false
    },
    amount: {
        type: Number,
        required: [true,'Please enter amount'],
        unique: false
    },
    refundable: {
        type: String,
        default: "No"
    },
    refundamount: {
        type: Number,
        default: 0
    },
    colid: {
        type: Number,
        required: [true,'Please enter colid']
    },
    status: {
        type: String,
        required: [true,'Please enter status'],
        unique: false
    },
    approvalhistory: {
        type: Array,
        default: []
    }
})
//
const Fees=mongoose.model('Fees',feesschema);

module.exports=Fees;
