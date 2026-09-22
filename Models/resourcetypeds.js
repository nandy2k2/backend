const mongoose = require("mongoose");

const resourceTypeSchema = new mongoose.Schema(
  {
    resourcetype: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

resourceTypeSchema.index({ colid: 1, resourcetype: 1 }, { unique: false });

module.exports = mongoose.model("resourcetypeds", resourceTypeSchema);
