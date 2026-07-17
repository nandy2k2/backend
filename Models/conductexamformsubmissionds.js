const mongoose = require("mongoose");

const uploadedDocumentSchema = new mongoose.Schema(
  {
    documenttype: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    filename: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" }
  },
  { _id: true }
);

const selectedCourseSchema = new mongoose.Schema(
  {
    course: { type: String, trim: true, default: "" },
    coursecode: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    fee: { type: Number, default: 0 },
    examtype: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const conductExamFormSubmissionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    formid: { type: String, required: true, trim: true },
    formname: { type: String, trim: true, default: "" },
    academicyear: { type: String, required: true, trim: true },
    regulation: { type: String, trim: true, default: "" },
    exam: { type: String, required: true, trim: true },
    examcode: { type: String, required: true, trim: true },
    examtype: { type: String, enum: ["Regular", "Supplementary"], required: true },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, required: true, trim: true },
    semester: { type: String, trim: true, default: "" },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    section: { type: String, trim: true, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    documents: [uploadedDocumentSchema],
    courses: [selectedCourseSchema],
    totalfee: { type: Number, default: 0 },
    validationstatus: { type: String, trim: true, default: "Pass" },
    validationcomments: { type: String, trim: true, default: "" },
    deficiencies: { type: [String], default: [] },
    status: { type: String, trim: true, default: "Submitted" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

conductExamFormSubmissionSchema.index({ colid: 1, formid: 1, examcode: 1, regno: 1, examtype: 1 });

module.exports = mongoose.model("conductexamformsubmissionds", conductExamFormSubmissionSchema);
