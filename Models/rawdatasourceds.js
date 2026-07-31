const mongoose = require("mongoose");

const rawDataSourceSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    sourcename: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

rawDataSourceSchema.index({ colid: 1, sourcename: 1 }, { unique: true });

module.exports = mongoose.model("rawdatasourceds", rawDataSourceSchema);
