const mongoose = require("mongoose");

const phdExaminerRubricSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    group: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExaminerRubricSchema.index({ colid: 1, academicyear: 1, programcode: 1, group: 1, topic: 1 });

module.exports = mongoose.models.phdexaminerrubricds || mongoose.model("phdexaminerrubricds", phdExaminerRubricSchema);
