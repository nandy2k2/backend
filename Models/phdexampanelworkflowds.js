const mongoose = require("mongoose");

const phdExamPanelWorkflowSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, default: "" },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    level: { type: Number, required: true },
    role: { type: String, trim: true, default: "" },
    approvername: { type: String, trim: true, default: "" },
    approveremail: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    remarks: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExamPanelWorkflowSchema.index({ colid: 1, programcode: 1, level: 1 });

module.exports = mongoose.models.phdexampanelworkflowds || mongoose.model("phdexampanelworkflowds", phdExamPanelWorkflowSchema);
