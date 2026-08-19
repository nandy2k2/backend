const mongoose = require("mongoose");

const phdOralDefenseAttendeeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    department: { type: String, trim: true, default: "" },
    designation: { type: String, trim: true, default: "" },
    institution: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const phdOralDefenseAssignmentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    panelid: { type: String, trim: true, required: true, index: true },
    panelname: { type: String, trim: true, required: true },
    memberid: { type: String, trim: true, required: true },
    nocapprovalid: { type: String, trim: true, required: true, index: true },
    submissionid: { type: String, trim: true, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    guidename: { type: String, trim: true, default: "" },
    guideemail: { type: String, trim: true, default: "" },
    examinername: { type: String, trim: true, required: true },
    examineremail: { type: String, trim: true, required: true },
    examinerdesignation: { type: String, trim: true, default: "" },
    examinertype: { type: String, trim: true, default: "" },
    targetdate: { type: String, trim: true, default: "" },
    oraldefensedate: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, enum: ["Assigned", "Approved", "Rejected"], default: "Assigned" },
    comments: { type: String, trim: true, default: "" },
    attendees: { type: [phdOralDefenseAttendeeSchema], default: [] },
    assigneddate: { type: Date, default: Date.now },
    revieweddate: { type: Date },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" },
    useremail: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdOralDefenseAssignmentSchema.index({ colid: 1, submissionid: 1, memberid: 1 }, { unique: true });
phdOralDefenseAssignmentSchema.index({ colid: 1, examineremail: 1, status: 1 });

module.exports = mongoose.models.phdoraldefenseassignmentds || mongoose.model("phdoraldefenseassignmentds", phdOralDefenseAssignmentSchema);
