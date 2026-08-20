const mongoose = require("mongoose");

const phdProgressDocumentSchema = new mongoose.Schema(
  {
    documentname: { type: String, trim: true, default: "" },
    documenttype: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    filename: { type: String, trim: true, default: "" },
    key: { type: String, trim: true, default: "" },
    uploadedat: { type: Date, default: Date.now }
  },
  { _id: false }
);

const phdProgressConversationSchema = new mongoose.Schema(
  {
    byname: { type: String, trim: true, default: "" },
    byemail: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const phdProgressReportSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    assignmentid: { type: String, trim: true, required: true, index: true },
    academicyear: { type: String, trim: true, default: "" },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "" },
    student: { type: String, trim: true, default: "" },
    regno: { type: String, trim: true, default: "", index: true },
    studentemail: { type: String, trim: true, default: "" },
    guidename: { type: String, trim: true, default: "" },
    guideemail: { type: String, trim: true, default: "", index: true },
    progressdate: { type: String, trim: true, default: "" },
    progress: { type: String, trim: true, default: "" },
    documents: { type: [phdProgressDocumentSchema], default: [] },
    conversation: { type: [phdProgressConversationSchema], default: [] },
    status: { type: String, trim: true, default: "Submitted" },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdProgressReportSchema.index({ colid: 1, assignmentid: 1, progressdate: -1 });

module.exports = mongoose.models.phdprogressreportds || mongoose.model("phdprogressreportds", phdProgressReportSchema);
