const mongoose = require("mongoose");

const libraryPhotocopyRequestSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    libraryid: { type: String, trim: true, index: true },
    libraryname: { type: String, trim: true },
    librarytype: { type: String, trim: true },
    accessionno: { type: String, required: true, trim: true },
    bookid: { type: String, trim: true },
    title: { type: String, trim: true },
    author: { type: String, trim: true },
    classification: { type: String, trim: true },
    publisher: { type: String, trim: true },
    category: { type: String, trim: true },
    frompage: { type: Number, default: 0 },
    topage: { type: Number, default: 0 },
    student: { type: String, required: true, trim: true },
    regno: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    semester: { type: String, trim: true },
    requestdate: { type: Date, default: Date.now },
    status: { type: String, trim: true, default: "Requested", index: true },
    documentlink: { type: String, trim: true },
    filename: { type: String, trim: true },
    actiondate: { type: Date },
    actionby: { type: String, trim: true },
    remarks: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryPhotocopyRequestSchema.index({ colid: 1, libraryid: 1, status: 1 });
libraryPhotocopyRequestSchema.index({ colid: 1, regno: 1, accessionno: 1, frompage: 1, topage: 1, status: 1 });

module.exports = mongoose.models.libraryphotocopyrequestds || mongoose.model("libraryphotocopyrequestds", libraryPhotocopyRequestSchema);
