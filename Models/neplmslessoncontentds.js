const mongoose = require("mongoose");

const flashCardSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true },
    questionimage: { type: String, trim: true },
    answer: { type: String, trim: true }
  },
  { _id: true }
);

const nepLmsLessonContentSchema = new mongoose.Schema(
  {
    lessonresourceid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsresourceds", index: true },
    lessonplantitle: { type: String, trim: true },
    sequence: { type: Number, default: 1 },
    contenttype: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true },
    topics: { type: String, trim: true },
    filelink: { type: String, trim: true },
    videolink: { type: String, trim: true },
    quizid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsquizds" },
    quiztitle: { type: String, trim: true },
    mindmapid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsmindmapds" },
    mindmaptitle: { type: String, trim: true },
    flashcards: [flashCardSchema],
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

nepLmsLessonContentSchema.index({ colid: 1, lessonresourceid: 1, sequence: 1 });
nepLmsLessonContentSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, coursegroup: 1 });

module.exports = mongoose.model("neplmslessoncontentds", nepLmsLessonContentSchema);
