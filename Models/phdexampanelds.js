const mongoose = require("mongoose");

const phdExamPanelSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    panelname: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    approvalstatus: { type: String, trim: true, default: "Draft" },
    currentlevel: { type: Number, default: 0 },
    currentapprovername: { type: String, trim: true, default: "" },
    currentapproveremail: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    rejecteddate: { type: Date },
    history: [{
      action: { type: String, trim: true, default: "" },
      level: { type: Number, default: 0 },
      approvername: { type: String, trim: true, default: "" },
      approveremail: { type: String, trim: true, default: "" },
      comments: { type: String, trim: true, default: "" },
      date: { type: Date, default: Date.now }
    }],
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExamPanelSchema.index({ colid: 1, academicyear: 1, programcode: 1, panelname: 1 });

module.exports = mongoose.models.phdexampanelds || mongoose.model("phdexampanelds", phdExamPanelSchema);
