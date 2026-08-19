const mongoose = require("mongoose");

const phdOralDefenseWorkflowSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, default: "" },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    level: { type: Number, required: true },
    approvername: { type: String, trim: true, required: true },
    approveremail: { type: String, trim: true, required: true },
    role: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    remarks: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdOralDefenseWorkflowSchema.index({ colid: 1, programcode: 1, level: 1 });

module.exports = mongoose.models.phdoraldefenseworkflowds || mongoose.model("phdoraldefenseworkflowds", phdOralDefenseWorkflowSchema);
