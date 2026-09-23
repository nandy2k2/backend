const mongoose = require("mongoose");

const base = {
  colid: { type: Number, required: true, index: true },
  name: String,
  user: String
};

const dressSchema = new mongoose.Schema({
  ...base,
  gender: { type: String, trim: true, required: true },
  dresstype: { type: String, trim: true, required: true },
  size: { type: String, trim: true, required: true },
  cost: { type: Number, default: 0 },
  status: { type: String, default: "Active" }
}, { timestamps: true });

const dressOrderSchema = new mongoose.Schema({
  ...base,
  dressid: { type: mongoose.Schema.Types.ObjectId, ref: "convocationdressnewds" },
  academicyear: String,
  regulation: String,
  program: String,
  programcode: String,
  semester: String,
  student: String,
  regno: { type: String, index: true },
  studentemail: String,
  gender: String,
  dresstype: String,
  size: String,
  cost: { type: Number, default: 0 },
  ledgerid: String,
  paymentstatus: { type: String, default: "Pending" },
  shippingstatus: { type: String, default: "Shipping pending" },
  shippingaddress: String,
  courier: String,
  trackingno: String,
  shippeddate: Date,
  shippingremarks: String
}, { timestamps: true });

const programFeeSchema = new mongoose.Schema({
  ...base,
  academicyear: { type: String, trim: true, required: true },
  program: String,
  programcode: { type: String, trim: true, required: true },
  fees: { type: Number, default: 0 },
  status: { type: String, default: "Active" }
}, { timestamps: true });

const registrationSchema = new mongoose.Schema({
  ...base,
  academicyear: String,
  regulation: String,
  program: String,
  programcode: String,
  semester: String,
  student: String,
  regno: { type: String, index: true },
  studentemail: String,
  fees: { type: Number, default: 0 },
  ledgerid: String,
  paymentstatus: { type: String, default: "Pending" },
  status: { type: String, default: "Registered" }
}, { timestamps: true });

const emailLogSchema = new mongoose.Schema({
  ...base,
  academicyear: String,
  program: String,
  programcode: String,
  semester: String,
  subject: String,
  body: String,
  emailconfigurationid: String,
  sentcount: { type: Number, default: 0 },
  recipients: { type: Array, default: [] },
  status: String,
  error: String
}, { timestamps: true });

dressSchema.index({ colid: 1, gender: 1, dresstype: 1, size: 1 });
dressOrderSchema.index({ colid: 1, regno: 1, dressid: 1 });
programFeeSchema.index({ colid: 1, academicyear: 1, programcode: 1 }, { unique: false });
registrationSchema.index({ colid: 1, academicyear: 1, programcode: 1, regno: 1 });

module.exports = {
  ConvocationDress: mongoose.model("convocationdressnewds", dressSchema),
  ConvocationDressOrder: mongoose.model("convocationdressordernewds", dressOrderSchema),
  ConvocationProgramFee: mongoose.model("convocationprogramfeenewds", programFeeSchema),
  ConvocationRegistration: mongoose.model("convocationregistrationnewds", registrationSchema),
  ConvocationEmailLog: mongoose.model("convocationemaillognewds", emailLogSchema)
};
