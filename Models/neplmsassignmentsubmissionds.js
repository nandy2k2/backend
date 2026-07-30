const mongoose = require("mongoose");

const nepLmsAssignmentSubmissionSchema = new mongoose.Schema(
  {
    assignmentid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsresourceds", index: true },
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
    assignmenttitle: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, required: true, index: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    comments: { type: String, trim: true },
    fullmarks: { type: Number, default: 0 },
    marks: { type: Number, default: 0 },
    facultycomments: { type: String, trim: true },
    gradedby: { type: String, trim: true },
    gradeddate: { type: Date },
    submitteddate: { type: Date, default: Date.now },
    filename: String,
    originalname: String,
    mimetype: String,
    size: Number,
    bucket: String,
    region: String,
    key: String,
    url: String,
    status: { type: String, trim: true, default: "Submitted" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsAssignmentSubmissionSchema.index({ colid: 1, regno: 1, assignmentid: 1 });

module.exports = mongoose.model("neplmsassignmentsubmissionds", nepLmsAssignmentSubmissionSchema);
