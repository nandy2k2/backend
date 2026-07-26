const mongoose = require("mongoose");

const passMarksConfigurationSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    component: { type: String, enum: ["Theory", "Practical", "Viva"], required: true },
    maxmarks: { type: Number, default: 0 },
    passmarks: { type: Number, default: 0 },
    passpercentage: { type: Number, default: 0 },
    user: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

passMarksConfigurationSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  coursecode: 1,
  component: 1
}, { unique: true });

module.exports = mongoose.model("passmarksconfigurationds", passMarksConfigurationSchema);
