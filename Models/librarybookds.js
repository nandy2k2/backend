const mongoose = require("mongoose");

const libraryBookSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    libraryid: { type: String, trim: true, index: true },
    libraryname: { type: String, trim: true },
    librarytype: { type: String, trim: true },
    accessionno: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, trim: true },
    classification: { type: String, trim: true },
    classificationnumber: { type: String, trim: true },
    publisher: { type: String, trim: true },
    publisheraddress: { type: String, trim: true },
    isbn: { type: String, trim: true },
    category: { type: String, trim: true },
    subject: { type: String, trim: true },
    edition: { type: String, trim: true },
    publicationyear: { type: String, trim: true },
    language: { type: String, trim: true },
    rackno: { type: String, trim: true },
    shelfno: { type: String, trim: true },
    location: { type: String, trim: true },
    supplier: { type: String, trim: true },
    invoiceno: { type: String, trim: true },
    invoicedate: { type: Date },
    keywords: { type: String, trim: true },
    purchasedate: { type: Date },
    price: { type: Number, default: 0 },
    pages: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Available" },
    barcodevalue: { type: String, trim: true },
    qrcodeurl: { type: String, trim: true },
    remarks: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryBookSchema.index({ colid: 1, libraryid: 1, accessionno: 1 }, { unique: true });

module.exports = mongoose.models.librarybookds || mongoose.model("librarybookds", libraryBookSchema);
