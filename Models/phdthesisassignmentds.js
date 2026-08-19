const mongoose = require("mongoose");

const phdThesisAssignmentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true, index: true },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    topic: { type: String, trim: true, required: true },
    subject: { type: String, trim: true, required: true },
    guidename: { type: String, trim: true, required: true },
    guideemail: { type: String, trim: true, required: true },
    startdate: { type: String, trim: true, default: "" },
    enddate: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdThesisAssignmentSchema.index({ colid: 1, regno: 1, programcode: 1, topic: 1 });

module.exports = mongoose.models.phdthesisassignmentds || mongoose.model("phdthesisassignmentds", phdThesisAssignmentSchema);
