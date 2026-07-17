const mongoose = require("mongoose");

const installmentRequestSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    student: { type: String, trim: true },
    regno: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    academicyear: { type: String, trim: true, index: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true, index: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    totalamount: { type: Number, default: 0 },
    selectedledgerids: { type: [String], default: [] },
    selecteditems: { type: Array, default: [] },
    installments: { type: Array, default: [] },
    stage: { type: String, trim: true, default: "Program", index: true },
    currentlevel: { type: Number, default: 1 },
    status: { type: String, trim: true, default: "Pending Program Approval", index: true },
    approvalhistory: { type: Array, default: [] },
    ledgeradjusted: { type: String, trim: true, default: "No" },
    createdby: { type: String, trim: true },
    remarks: { type: String, trim: true }
  },
  { timestamps: true }
);

installmentRequestSchema.index({ colid: 1, programcode: 1, stage: 1, currentlevel: 1, status: 1 });

module.exports = mongoose.models.installmentrequestds || mongoose.model("installmentrequestds", installmentRequestSchema);
