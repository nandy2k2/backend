const mongoose = require('mongoose');

const SubjectMarksSchema = new mongoose.Schema({
  subject: String,
  marks: Number
}, { _id: false });

const AdmissionDocumentSchema = new mongoose.Schema({
  documenttype: String,
  description: String,
  filename: String,
  originalname: String,
  mimetype: String,
  size: Number,
  bucket: String,
  region: String,
  key: String,
  url: String,
  uploadedAt: Date
}, { _id: false });

const AdmissionApplicationDynamicSchema = new mongoose.Schema({
  colid: Number,
  formid: {
    type: String,
    default: 'default'
  },
  academicyear: String,
  name: String,
  applicationid: String,
  applicationnumber: String,
  username: String,
  password: String,
  email: String,
  phone: String,
  regno: String,
  address: String,
  pin: String,
  country_form: String,
  state_form: String,
  district_form: String,
  result_status_12th: String,
  board_12th: String,
  marks_type_12th: String,
  marks_12: {
    type: Number,
    default: 0
  },
  cgpa_12: String,
  result_status_10th: String,
  board_10th: String,
  marks_type_10th: String,
  marks_10: {
    type: Number,
    default: 0
  },
  cgpa_10: String,
  University_UG: String,
  result_status_UG: String,
  marks_type_UG: String,
  marks_UG: {
    type: Number,
    default: 0
  },
  cgpa_UG: String,
  University_PG: String,
  result_status_PG: String,
  marks_type_PG: String,
  marks_PG: {
    type: Number,
    default: 0
  },
  cgpa_PG: String,
  gender: String,
  category: String,
  ews: String,
  ph: String,
  minority: String,
  tenthmarks: Number,
  twelvemarks: Number,
  externaltheorymarks: Number,
  englishmarks: Number,
  dateofbirth: String,
  dateofapplication: String,
  age: Number,
  twelvesubjects: String,
  level: String,
  programtype: String,
  programapplied: String,
  programcode: String,
  applicationstatus: {
    type: String,
    default: 'Applied'
  },
  enrollmentstatus: String,
  applicationcomments: String,
  validationstatus: {
    type: String,
    default: ''
  },
  validationcomments: String,
  tenthsubjectmarks: [SubjectMarksSchema],
  twelvesubjectmarks: [SubjectMarksSchema],
  documents: [AdmissionDocumentSchema],
  extraFields: mongoose.Schema.Types.Mixed,
  applicationfeeamount: {
    type: Number,
    default: 0
  },
  paymentstatus: {
    type: String,
    default: 'Not Required'
  },
  paymentrefno: String,
  paidamount: {
    type: Number,
    default: 0
  },
  paiddate: Date,
  paymentdetails: mongoose.Schema.Types.Mixed,
  provisionalfeeamount: {
    type: Number,
    default: 0
  },
  provisionalpaymentstatus: {
    type: String,
    default: 'Not Required'
  },
  provisionalpaymentrefno: String,
  provisionalpaidamount: {
    type: Number,
    default: 0
  },
  provisionalpaiddate: Date,
  provisionalpaymentdetails: mongoose.Schema.Types.Mixed,
  user: String
}, { timestamps: true });

AdmissionApplicationDynamicSchema.index({ colid: 1, email: 1 }, { unique: true, sparse: true });
AdmissionApplicationDynamicSchema.index({ colid: 1, phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('admissionapplicationdynamic', AdmissionApplicationDynamicSchema);
