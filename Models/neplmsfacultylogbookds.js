const mongoose = require("mongoose");

const nepLmsFacultyLogbookSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    faculty: { type: String, trim: true, required: true },
    facultyemail: { type: String, trim: true, required: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    typeofwork: { type: String, trim: true, enum: ["Assessment", "Class"], required: true },
    description: { type: String, trim: true, default: "" },
    dateofwork: { type: String, trim: true, required: true },
    outcome: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

nepLmsFacultyLogbookSchema.index({
  colid: 1,
  facultyemail: 1,
  academicyear: 1,
  programcode: 1,
  coursecode: 1,
  dateofwork: 1
});

module.exports = mongoose.model("neplmsfacultylogbookds", nepLmsFacultyLogbookSchema);
