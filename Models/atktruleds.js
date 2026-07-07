const mongoose = require("mongoose");

const atktRuleSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, required: true, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    maxbacklog: { type: Number, default: 0 },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

atktRuleSchema.index(
  { colid: 1, academicyear: 1, regulation: 1, programcode: 1, semester: 1 },
  { unique: true }
);

module.exports = mongoose.model("atktruleds", atktRuleSchema);
