const mongoose = require("mongoose");

const flashCardSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true },
    questionimage: { type: String, trim: true },
    answer: { type: String, trim: true }
  },
  { _id: true }
);

const nepLmsPreReadingSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    contenttype: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    topics: { type: String, trim: true },
    sequence: { type: Number, default: 1 },
    filelink: { type: String, trim: true },
    videolink: { type: String, trim: true },
    mindmapid: { type: String, trim: true },
    mindmaptitle: { type: String, trim: true },
    flashcards: [flashCardSchema],
    filename: { type: String, trim: true },
    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: Number,
    bucket: String,
    region: String,
    key: String,
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsPreReadingSchema.index({ colid: 1, academicyear: 1, programcode: 1, semester: 1, coursecode: 1 });
nepLmsPreReadingSchema.index({ colid: 1, facultyemail: 1, coursecode: 1 });

module.exports = mongoose.models.neplmsprereadingds || mongoose.model("neplmsprereadingds", nepLmsPreReadingSchema);
