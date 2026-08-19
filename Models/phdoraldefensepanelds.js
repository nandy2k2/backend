const mongoose = require("mongoose");

const phdOralDefensePanelSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    panelname: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    approvalstatus: { type: String, trim: true, enum: ["Draft", "Submitted", "Approved", "Rejected"], default: "Draft" },
    status: { type: String, trim: true, default: "Active" },
    currentlevel: { type: Number, default: 0 },
    currentapprovername: { type: String, trim: true, default: "" },
    currentapproveremail: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    rejecteddate: { type: Date },
    comments: { type: String, trim: true, default: "" },
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
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdOralDefensePanelSchema.index({ colid: 1, academicyear: 1, programcode: 1, panelname: 1 });

module.exports = mongoose.models.phdoraldefensepanelds || mongoose.model("phdoraldefensepanelds", phdOralDefensePanelSchema);
