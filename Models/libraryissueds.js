const mongoose = require("mongoose");

const libraryIssueSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    libraryid: { type: String, trim: true, index: true },
    libraryname: { type: String, trim: true },
    librarytype: { type: String, trim: true },
    accessionno: { type: String, required: true, trim: true, index: true },
    bookid: { type: String, trim: true },
    title: { type: String, trim: true },
    author: { type: String, trim: true },
    classification: { type: String, trim: true },
    publisher: { type: String, trim: true },
    publisheraddress: { type: String, trim: true },
    invoiceno: { type: String, trim: true },
    invoicedate: { type: Date },
    keywords: { type: String, trim: true },
    category: { type: String, trim: true },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    semester: { type: String, trim: true },
    section: { type: String, trim: true },
    issuetype: { type: String, trim: true, default: "Regular" },
    issuedate: { type: Date, default: Date.now },
    duedate: { type: Date },
    returndate: { type: Date },
    status: { type: String, trim: true, default: "Issued", index: true },
    fineamount: { type: Number, default: 0 },
    ledgerid: { type: String, trim: true },
    remarks: { type: String, trim: true },
    issuedby: { type: String, trim: true },
    returnedby: { type: String, trim: true },
    requestid: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryIssueSchema.index({ colid: 1, accessionno: 1, status: 1 });
libraryIssueSchema.index({ colid: 1, regno: 1, status: 1 });

module.exports = mongoose.models.libraryissueds || mongoose.model("libraryissueds", libraryIssueSchema);
