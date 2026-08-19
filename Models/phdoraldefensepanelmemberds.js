const mongoose = require("mongoose");

const phdOralDefensePanelMemberSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    oralpanelid: { type: String, trim: true, required: true, index: true },
    sourcepanelid: { type: String, trim: true, default: "" },
    sourcememberid: { type: String, trim: true, required: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    panelname: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    examinername: { type: String, trim: true, required: true },
    examineremail: { type: String, trim: true, required: true },
    designation: { type: String, trim: true, default: "" },
    qualification: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    specialization: { type: String, trim: true, default: "" },
    ugteachingexp: { type: String, trim: true, default: "" },
    pgteachingexp: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    eligible: { type: String, trim: true, enum: ["Yes", "No", ""], default: "Yes" },
    approvalstatus: { type: String, trim: true, enum: ["Draft", "Submitted", "Approved", "Rejected"], default: "Draft" },
    preferenceorder: { type: Number, default: 0 },
    currentlevel: { type: Number, default: 0 },
    currentapprovername: { type: String, trim: true, default: "" },
    currentapproveremail: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    rejecteddate: { type: Date },
    approvalcomments: { type: String, trim: true, default: "" },
    history: {
      type: [{
        action: { type: String, trim: true, default: "" },
        level: { type: Number, default: 0 },
        approvername: { type: String, trim: true, default: "" },
        approveremail: { type: String, trim: true, default: "" },
        comments: { type: String, trim: true, default: "" },
        date: { type: Date, default: Date.now }
      }],
      default: []
    },
    user: { type: String, trim: true, default: "" },
    useremail: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    createdby: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdOralDefensePanelMemberSchema.index({ colid: 1, oralpanelid: 1, sourcememberid: 1 }, { unique: true });

module.exports = mongoose.models.phdoraldefensepanelmemberds || mongoose.model("phdoraldefensepanelmemberds", phdOralDefensePanelMemberSchema);
