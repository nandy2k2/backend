const mongoose = require("mongoose");

const modulePlannerSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    faculty: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true },
    module: { type: String, trim: true, required: true },
    lectureno: { type: String, trim: true, required: true },
    lecturedate: { type: String, trim: true, required: true },
    lecturetype: { type: String, trim: true, enum: ["Theory", "Practical", "Additional"], default: "Theory" },
    status: { type: String, trim: true, default: "Active" },
    moduleallocationid: { type: mongoose.Schema.Types.ObjectId, ref: "moduleallocationds" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    name: { type: String, trim: true }
  },
  { timestamps: true }
);

modulePlannerSchema.index({ colid: 1, academicyear: 1, programcode: 1, coursecode: 1, facultyemail: 1, lecturedate: 1 });

module.exports = mongoose.models.moduleplannerds || mongoose.model("moduleplannerds", modulePlannerSchema);
