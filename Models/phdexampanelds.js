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
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExamPanelSchema.index({ colid: 1, academicyear: 1, programcode: 1, panelname: 1 });

module.exports = mongoose.models.phdexampanelds || mongoose.model("phdexampanelds", phdExamPanelSchema);
