const mongoose = require("mongoose");

const continuousFeedbackAnswerSchema = new mongoose.Schema(
  {
    questionid: { type: String, trim: true },
    question: { type: String, trim: true },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, trim: true }
  },
  { _id: false }
);

const continuousFeedbackResponseSchema = new mongoose.Schema(
  {
    formid: { type: String, trim: true, index: true },
    formtitle: { type: String, trim: true },
    timetableid: { type: String, trim: true, index: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    classdate: { type: String, trim: true },
    classtime: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    studentemail: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    answers: [continuousFeedbackAnswerSchema],
    average: { type: Number, default: 0 },
    overallcomment: { type: String, trim: true },
    status: { type: String, trim: true, default: "Submitted" },
    submittedat: { type: Date, default: Date.now },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

continuousFeedbackResponseSchema.index({ colid: 1, formid: 1, timetableid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.continuousfeedbackresponseds || mongoose.model("continuousfeedbackresponseds", continuousFeedbackResponseSchema);
