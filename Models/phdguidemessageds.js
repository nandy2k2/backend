const mongoose = require("mongoose");

const phdGuideMessageDocumentSchema = new mongoose.Schema(
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

const phdGuideMessageSchema = new mongoose.Schema(
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
    sendername: { type: String, trim: true, default: "" },
    senderemail: { type: String, trim: true, default: "" },
    senderrole: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    documents: { type: [phdGuideMessageDocumentSchema], default: [] },
    messagedate: { type: Date, default: Date.now },
    status: { type: String, trim: true, default: "Sent" }
  },
  { timestamps: true }
);

phdGuideMessageSchema.index({ colid: 1, assignmentid: 1, messagedate: -1 });

module.exports = mongoose.models.phdguidemessageds || mongoose.model("phdguidemessageds", phdGuideMessageSchema);
