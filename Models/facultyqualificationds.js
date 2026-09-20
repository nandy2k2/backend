const mongoose = require("mongoose");

const facultyQualificationSchema = new mongoose.Schema(
  {
    user: { type: String, trim: true, required: true },
    useremail: { type: String, trim: true, required: true },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "" },
    semester: { type: String, trim: true, default: "" },
    courses: [{ type: String, trim: true }],
    coursecodes: [{ type: String, trim: true }],
    subject: { type: String, trim: true, required: true },
    expertise: { type: String, trim: true, default: "" },
    noofyears: { type: Number, default: 0 },
    phd: { type: String, trim: true, enum: ["Yes", "No"], default: "No" },
    colid: { type: Number, required: true, index: true },
    createdby: { type: String, trim: true, default: "" },
    createdbyname: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

facultyQualificationSchema.index({ colid: 1, useremail: 1, programcode: 1, semester: 1, subject: 1, expertise: 1 });

module.exports = mongoose.model("facultyqualificationds", facultyQualificationSchema);
