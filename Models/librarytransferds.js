const mongoose = require("mongoose");

const libraryTransferSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    accessionno: { type: String, required: true, trim: true, index: true },
    bookid: { type: String, trim: true },
    title: { type: String, trim: true },
    author: { type: String, trim: true },
    category: { type: String, trim: true },
    fromlibraryid: { type: String, required: true, trim: true },
    fromlibraryname: { type: String, trim: true },
    tolibraryid: { type: String, required: true, trim: true },
    tolibraryname: { type: String, trim: true },
    transferdate: { type: Date, default: Date.now },
    status: { type: String, trim: true, default: "Applied", index: true },
    requestedby: { type: String, trim: true },
    approvedby: { type: String, trim: true },
    approveddate: { type: Date },
    remarks: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryTransferSchema.index({ colid: 1, status: 1, fromlibraryid: 1, tolibraryid: 1 });

module.exports = mongoose.models.librarytransferds || mongoose.model("librarytransferds", libraryTransferSchema);
