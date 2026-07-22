const mongoose = require("mongoose");

const libraryRoleMaxBooksSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    role: { type: String, required: true, trim: true, index: true },
    bookcategory: { type: String, required: true, trim: true, index: true },
    noofbooks: { type: Number, default: 0 },
    default: { type: String, trim: true, default: "No" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryRoleMaxBooksSchema.index({ colid: 1, role: 1, bookcategory: 1 }, { unique: true });

module.exports = mongoose.models.libraryrolemaxbooksds || mongoose.model("libraryrolemaxbooksds", libraryRoleMaxBooksSchema);
