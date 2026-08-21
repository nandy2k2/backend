const mongoose = require("mongoose");

const phdExamPanelMemberSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    panelid: { type: String, trim: true, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    panelname: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    examinername: { type: String, trim: true, required: true },
    examineremail: { type: String, trim: true, required: true },
    designation: { type: String, trim: true, default: "" },
    qualification: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, enum: ["Internal", "External", ""], default: "" },
    specialization: { type: String, trim: true, default: "" },
    ugteachingexp: { type: String, trim: true, default: "" },
    pgteachingexp: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    eligible: { type: String, trim: true, enum: ["Yes", "No", ""], default: "Yes" },
    approvalstatus: { type: String, trim: true, enum: ["Pending", "Submitted", "Approved", "Rejected"], default: "Pending" },
    currentlevel: { type: Number, default: 0 },
    currentapprovername: { type: String, trim: true, default: "" },
    currentapproveremail: { type: String, trim: true, default: "" },
    approvedby: { type: String, trim: true, default: "" },
    approvedbyemail: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    rejecteddate: { type: Date },
    approvalcomments: { type: String, trim: true, default: "" },
    history: [{
      action: { type: String, trim: true, default: "" },
      level: { type: Number, default: 0 },
      approvername: { type: String, trim: true, default: "" },
      approveremail: { type: String, trim: true, default: "" },
      comments: { type: String, trim: true, default: "" },
      date: { type: Date, default: Date.now }
    }],
    comments: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" },
    useremail: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExamPanelMemberSchema.index({ colid: 1, panelid: 1, examineremail: 1 });

module.exports = mongoose.models.phdexampanelmemberds || mongoose.model("phdexampanelmemberds", phdExamPanelMemberSchema);
