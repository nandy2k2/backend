const mongoose = require("mongoose");

const descriptiveQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true, required: true },
    marks: { type: Number, default: 1 },
    imageurl: { type: String, trim: true },
    imagefilename: { type: String, trim: true },
    fileurl: { type: String, trim: true },
    filename: { type: String, trim: true },
    videourl: { type: String, trim: true },
    conumber: { type: String, trim: true },
    co: { type: String, trim: true },
    bloomlevel: { type: String, trim: true },
    aiCheckStatus: { type: String, trim: true },
    aiCheckFeedback: { type: String, trim: true },
    aiSuggestedCo: { type: String, trim: true },
    aiSuggestedBloomlevel: { type: String, trim: true }
  },
  { timestamps: true }
);

const descriptiveSectionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    questions: [descriptiveQuestionSchema]
  },
  { timestamps: true }
);

const nepLmsDescriptiveAssessmentSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    subject: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    section: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    title: { type: String, trim: true, required: true },
    instructions: { type: String, trim: true },
    module: { type: String, trim: true },
    topic: { type: String, trim: true },
    startdatetime: { type: Date, required: true },
    enddatetime: { type: Date, required: true },
    sections: [descriptiveSectionSchema],
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsDescriptiveAssessmentSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, facultyemail: 1 });

module.exports = mongoose.model("neplmsdescriptiveassessmentds", nepLmsDescriptiveAssessmentSchema);
