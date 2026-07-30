const mongoose = require("mongoose");

const nepLmsLessonContentProgressSchema = new mongoose.Schema(
  {
    contentid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmslessoncontentds", required: true, index: true },
    lessonresourceid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsresourceds", index: true },
    lessonplantitle: { type: String, trim: true },
    contenttitle: { type: String, trim: true },
    contenttype: { type: String, trim: true },
    sequence: { type: Number, default: 1 },
    totalsteps: { type: Number, default: 0 },
    completedsteps: { type: Number, default: 0 },
    progresspercentage: { type: Number, default: 0 },
    stepstatus: { type: String, trim: true, default: "Completed" },
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
    student: { type: String, trim: true },
    regno: { type: String, trim: true, required: true, index: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    completed: { type: Boolean, default: true },
    completedat: { type: Date, default: Date.now },
    comments: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsLessonContentProgressSchema.index({ colid: 1, contentid: 1, regno: 1 }, { unique: true });
nepLmsLessonContentProgressSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, coursegroup: 1, regno: 1 });

module.exports = mongoose.model("neplmslessoncontentprogressds", nepLmsLessonContentProgressSchema);
