const mongoose = require("mongoose");

const libraryFineCategorySchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    category: { type: String, required: true, trim: true },
    fineperday: { type: Number, default: 0 },
    graceperioddays: { type: Number, default: 0 },
    maxfine: { type: Number, default: 0 },
    status: { type: String, trim: true, default: "Active" },
    remarks: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryFineCategorySchema.index({ colid: 1, category: 1 }, { unique: true });

module.exports = mongoose.models.libraryfinecategoryds || mongoose.model("libraryfinecategoryds", libraryFineCategorySchema);
