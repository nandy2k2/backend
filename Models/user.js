const mongoose=require('mongoose');

const userschema = new mongoose.Schema({
    email: {
        type: String,
        required: [true,'Please enter email'],
        unique: true
    },
    googleemail: {
        type: String
    },
    excluded: {
        type: String,
        enum: ['Yes', 'No'],
        default: 'No'
    },
    authenticator: {
        type: String,
        enum: ['Yes', 'No'],
        default: function () {
            return String(this.role || '').toLowerCase() === 'student' ? 'No' : 'Yes';
        }
    },
    authenticatordate: {
        type: Date
    },
    authenticatorsecret: {
        type: String
    },
    authenticatorsetupdate: {
        type: Date
    },
    name: {
        type: String,
        required: [true,'Please enter name']
    },
    phone: {
        type: String,
        required: [true,'Please enter phone']
    },
    password: {
        type: String,
        required: [true,'Please enter password']
    },
    role: {
        type: String,
        required: [true,'Please enter role']
    },
    regno: {
        type: String,
        required: [true,'Please enter regno']
    },
    scholarnumber: {
        type: String
    },
    abcid: {
        type: String
    },
    program: {
        type: String
    },
    programcode: {
        type: String,
        required: [true,'Please enter program code']
    },
    admissionyear: {
        type: String,
        required: [true,'Please enter admission year']
    },
    academicyear: {
        type: String
    },
    rollno: {
        type: String
    },
    semester: {
        type: String,
        required: [true,'Please enter semester']
    },
    section: {
        type: String,
        required: [true,'Please enter section']
    },
    gender: {
        type: String
    },
    state: {
        type: String
    },
    city: {
        type: String
    },
    district: {
        type: String
    },
    pincode: {
        type: String
    },
    department: {
        type: String,
        required: [true,'Please enter role']
    },
    designation: {
        type: String
    },
    pan: {
        type: String
    },
    photo: {
        type: String
    },
    guardianname: {
        type: String
    },
    guardianmobile: {
        type: String
    },
    guardianemail: {
        type: String
    },
    expotoken: {
        type: String
    },
    category: {
        type: String
    },
    address: {
        type: String
    },
    quota: {
        type: String
    },
    user: {
        type: String
    },
    addedby: {
        type: String
    },
    status1: {
        type: String
    },
    comments: {
        type: String
    },
    lastlogin: {
        type: Date
    },
    colid: {
        type: Number,
        required: [true,'Please enter colid']
    },
    status: {
        type: Number,
        required: [true,'Please enter status']
    },
    fathername: {
        type: String
    },
    mothername: {
        type: String
    },
    dob: {
        type: String
    },
    birthdate: {
        type: Date
    },
    joiningdate: {
        type: Date
    },
    eligibilityname: {
        type: String
    },
    srno: {
        type: Number
    },
    degree: {
        type: String
    },
    regulation: {
        type: String
    },
    samestate: {
        type: String
    },
    admissionapplicationid: {
        type: String
    },
    Major: {
        type: String
    },
    Minor: {
        type: String
    },
    AEC: {
        type: String
    },
    SEC: {
        type: String
    },
    VAC: {
        type: String
    },
    IDC: {
        type: String
    },
    MDC: {
        type: String
    },
    minorsub: {
        type: String
    },
    vocationalsub: {
        type: String
    },
    mdcsub: {
        type: String
    },
    othersub:{
        type: String
    }, // other subjects means PW/AP/CE Subjects
    merit: {
        type: String
    },
    obtain: {
        type:Number
    },
    bonus: {
        type: Number
    },
    weightage: {
        type: Number
    },
    ncctype: {
        type: String
    },
    isdisabled: {
        type: String
    },
    scholarship:{
        type: String
    },
    skills: {
        type: String
    },
    institution:{
        type: String
    },
    Mediumofinstruction:{
        type: String
    },
    specialization1:{
        type: String
    },
    specialization2:{
        type: String
    },
    profileapprovalstatus:{
        type: String
    },
    profileapprovalcomments:{
        type: String
    },
    customFields: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
})
//
const User=mongoose.models.Users || mongoose.model('Users',userschema);

module.exports=User;
