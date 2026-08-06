const mongoose = require("mongoose");

const nepLmsResourceSchema = new mongoose.Schema(
  {
    resourcetype: { type: String, trim: true, required: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    coursegroup: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    title: { type: String, trim: true },
    section: { type: String, trim: true },
    module: { type: String, trim: true },
    topic: { type: String, trim: true },
    description: { type: String, trim: true },
    order: { type: Number, default: 0 },
    employabilityrelated: { type: String, trim: true, default: "No" },
    duedate: { type: String, trim: true },
    fullmarks: { type: Number, default: 0 },
    filename: { type: String, trim: true },
    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: Number,
    bucket: String,
    region: String,
    key: String,
    url: String,
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsResourceSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, coursegroup: 1, resourcetype: 1 });

module.exports = mongoose.model("neplmsresourceds", nepLmsResourceSchema);
