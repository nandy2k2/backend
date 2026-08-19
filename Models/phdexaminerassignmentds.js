const mongoose = require("mongoose");

const phdExaminerAssignmentDocumentSchema = new mongoose.Schema(
  {
    documentname: { type: String, trim: true, default: "" },
    documenttype: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    filename: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    uploadedat: { type: Date, default: Date.now }
  },
  { _id: false }
);

const phdExaminerAssignmentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    panelid: { type: String, trim: true, required: true, index: true },
    panelname: { type: String, trim: true, required: true },
    memberid: { type: String, trim: true, required: true },
    submissionid: { type: String, trim: true, required: true, index: true },
    assignmentid: { type: String, trim: true, default: "" },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    fileurl: { type: String, trim: true, default: "" },
    filename: { type: String, trim: true, default: "" },
    documents: { type: [phdExaminerAssignmentDocumentSchema], default: [] },
    guidename: { type: String, trim: true, default: "" },
    guideemail: { type: String, trim: true, default: "" },
    examinername: { type: String, trim: true, required: true },
    examineremail: { type: String, trim: true, required: true },
    examinerdesignation: { type: String, trim: true, default: "" },
    examinertype: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    remarks: { type: String, trim: true, default: "" },
    assigneddate: { type: Date, default: Date.now },
    revieweddate: { type: Date },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" },
    useremail: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExaminerAssignmentSchema.index({ colid: 1, submissionid: 1, memberid: 1 }, { unique: true });
phdExaminerAssignmentSchema.index({ colid: 1, examineremail: 1, status: 1 });

module.exports = mongoose.models.phdexaminerassignmentds || mongoose.model("phdexaminerassignmentds", phdExaminerAssignmentSchema);
