const mongoose = require("mongoose");

const specializationNewSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    semester: { type: String, trim: true, required: true },
    specialization: { type: String, trim: true, required: true },
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

specializationNewSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1, specialization: 1 });

module.exports = mongoose.model("specializationnewds", specializationNewSchema);
