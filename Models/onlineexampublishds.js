const mongoose = require("mongoose");

const OnlineExamPublishSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexamds", required: true, index: true },
  examname: String,
  examcode: String,
  program: String,
  programcode: String,
  semester: String,
  course: String,
  coursecode: String,
  startdate: Date,
  enddate: Date,
  active: { type: String, default: "Yes", index: true },
  remarks: String,
  user: String,
  username: String
}, { timestamps: true });

OnlineExamPublishSchema.index({ colid: 1, academicyear: 1, examid: 1 }, { unique: true });

module.exports = mongoose.model("onlineexampublishds", OnlineExamPublishSchema);
