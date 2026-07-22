const mongoose = require("mongoose");

const libraryRoleMaxDaysSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    role: { type: String, required: true, trim: true, index: true },
    bookcategory: { type: String, required: true, trim: true, index: true },
    noofdays: { type: Number, default: 0 },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

libraryRoleMaxDaysSchema.index({ colid: 1, role: 1, bookcategory: 1 }, { unique: true });

module.exports = mongoose.models.libraryrolemaxdaysds || mongoose.model("libraryrolemaxdaysds", libraryRoleMaxDaysSchema);
