const mongoose = require("mongoose");

const libraryMasterSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    libraryname: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, trim: true, enum: ["University", "Departmental", "Special"], default: "University" },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryMasterSchema.index({ colid: 1, libraryname: 1 }, { unique: true });

module.exports = mongoose.models.librarymasterds || mongoose.model("librarymasterds", libraryMasterSchema);
