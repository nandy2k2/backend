const mongoose = require("mongoose");

const phdNocHistorySchema = new mongoose.Schema(
  {
    action: { type: String, trim: true, default: "" },
    level: { type: Number, default: 0 },
    approvername: { type: String, trim: true, default: "" },
    approveremail: { type: String, trim: true, default: "" },
    comments: { type: String, trim: true, default: "" },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const phdNocApprovalSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    submissionid: { type: String, trim: true, required: true, unique: true, index: true },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true, index: true },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true, index: true },
    email: { type: String, trim: true, default: "" },
    topic: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    guidename: { type: String, trim: true, default: "" },
    guideemail: { type: String, trim: true, default: "" },
    fileurl: { type: String, trim: true, default: "" },
    filename: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Submitted", index: true },
    currentlevel: { type: Number, default: 1 },
    currentapprovername: { type: String, trim: true, default: "" },
    currentapproveremail: { type: String, trim: true, default: "" },
    approveddate: { type: Date },
    rejecteddate: { type: Date },
    finalcomments: { type: String, trim: true, default: "" },
    history: { type: [phdNocHistorySchema], default: [] },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdNocApprovalSchema.index({ colid: 1, regno: 1, status: 1 });

module.exports = mongoose.models.phdnocapprovalds || mongoose.model("phdnocapprovalds", phdNocApprovalSchema);
