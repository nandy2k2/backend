const mongoose = require("mongoose");

const hostelCardTemplateSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    templatename: { type: String, required: true },
    description: { type: String },
    html: { type: String, required: true },
    orientation: { type: String, default: "Landscape" },
    isdefault: { type: String, default: "No" },
    status: { type: String, default: "Active" },
    user: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.models.hostelcardtemplateds || mongoose.model("hostelcardtemplateds", hostelCardTemplateSchema);
