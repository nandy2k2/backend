const mongoose = require("mongoose");

const continuousFeedbackQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true },
    order: { type: Number, default: 1 }
  },
  { _id: true }
);

const continuousFeedbackFormSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    title: { type: String, trim: true, default: "Quick feedback" },
    description: { type: String, trim: true },
    scale: {
      type: [String],
      default: ["Poor", "Fair", "Good", "Very good", "Excellent"]
    },
    questions: [continuousFeedbackQuestionSchema],
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

continuousFeedbackFormSchema.index({ colid: 1, academicyear: 1, regulation: 1, programcode: 1, coursecode: 1 });

module.exports = mongoose.models.continuousfeedbackformds || mongoose.model("continuousfeedbackformds", continuousFeedbackFormSchema);
