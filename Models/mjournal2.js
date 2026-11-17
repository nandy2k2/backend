const mongoose=require('mongoose');

const mjournal2schema = new mongoose.Schema({
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
accgroup: {
type: String
},
costcenter: {
type: String,
trim: true
},
institution: {type:String,trim:true},
account: {
type: String
},
acctype: {
type: String
},
transaction: {
type: String
},
transactionref: {
type: String
},
subledger: {
type: String
},
cogs: {
type: String
},
activitydate: {
type: Date
},
amount: {
type: Number
},
credit: {
type: Number
},
debit: {
type: Number
},
type: {
type: String
},
student: {
type: String
},
regno: {
type: String
},
empid: {
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
mjournal2schema.index({colid:1,costcenter:1,year:1,activitydate:1});
const mjournal2=mongoose.model('mjournal2',mjournal2schema);

module.exports=mjournal2;

