const mongoose = require("mongoose");

const libraryAccessSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    libraryid: { type: String, required: true, trim: true, index: true },
    libraryname: { type: String, trim: true },
    librarytype: { type: String, trim: true },
    name: { type: String, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    role: { type: String, trim: true },
    department: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryAccessSchema.index({ colid: 1, libraryid: 1, email: 1 }, { unique: true });

module.exports = mongoose.models.libraryaccessds || mongoose.model("libraryaccessds", libraryAccessSchema);
