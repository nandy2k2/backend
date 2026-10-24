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
programgroup: {
type: String,
trim: true
},
enrollmentcode: { type: String, trim: true },
displayname: { type: String, trim: true },
marksheetname: { type: String, trim: true },
branchcode: { type: String, trim: true },
programlevelcode: { type: String, trim: true },
gender: { type: String, enum: ['', 'Male', 'Female', 'All'] },
coursetype: { type: String, enum: ['', 'Regular', 'Online', 'ODL'] },
coursetime: { type: String, enum: ['', 'Full', 'Parttime'] },
shift: { type: String, trim: true },
programincharge: { type: String, trim: true },
programinchargeemail: { type: String, trim: true },
semestertype: { type: String, enum: ['', 'Annual', 'Semester', 'Trimester'] },
noofsemesters: { type: Number, min: 0 },
noofyears: { type: Number, min: 0 },
maxallowedyear: { type: Number, min: 0 },
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
	faculty: {
	type: String
	},
	durationinyear: {
	type: Number
	},
totalcredits: {
type: Number
},
intakecapacity: {
type: Number
},
amount: {
type: Number,
default: 0
},
excluded: {
type: String,
enum: ["Yes", "No"],
default: "No"
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
