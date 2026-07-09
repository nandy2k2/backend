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

const userEmploymentDetailSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    owneruser: { type: String, trim: true, required: true, index: true },
    ownername: { type: String, trim: true },
    role: { type: String, trim: true },
    organizationname: { type: String, trim: true, required: true },
    designation: { type: String, trim: true },
    employmenttype: { type: String, trim: true },
    dateofjoining: { type: String, trim: true },
    lastworkingdate: { type: String, trim: true },
    totalexperience: { type: String, trim: true },
    lastdrawnsalary: { type: Number, default: 0 },
    reasonforleaving: { type: String, trim: true },
    documents: [profileDocumentSchema],
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

userEmploymentDetailSchema.index({ colid: 1, owneruser: 1, organizationname: 1, dateofjoining: 1 });

module.exports = mongoose.model("useremploymentdetailds", userEmploymentDetailSchema);
