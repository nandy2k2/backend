const mongoose = require("mongoose");

const profileDocumentSchema = new mongoose.Schema(
  {
    documentname: { type: String, trim: true },
    description: { type: String, trim: true },
    url: { type: String, trim: true },
    filename: { type: String, trim: true },
    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: { type: Number, default: 0 },
    key: { type: String, trim: true },
    uploadedat: { type: Date, default: Date.now },
    uploadedby: { type: String, trim: true }
  },
  { _id: false }
);

const userAcademicDetailSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    owneruser: { type: String, trim: true, required: true, index: true },
    ownername: { type: String, trim: true },
    role: { type: String, trim: true },
    qualification: { type: String, trim: true, required: true },
    specialization: { type: String, trim: true },
    universityboard: { type: String, trim: true },
    institutecollege: { type: String, trim: true },
    passingyear: { type: String, trim: true },
    percentagecgpa: { type: String, trim: true },
    modeofstudy: { type: String, trim: true },
    documents: [profileDocumentSchema],
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

userAcademicDetailSchema.index({ colid: 1, owneruser: 1, qualification: 1, passingyear: 1 });

module.exports = mongoose.model("useracademicdetailds", userAcademicDetailSchema);
