const mongoose = require("mongoose");

const aiChatbotDefinitionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    role: { type: String, trim: true, required: true, index: true },
    slno: { type: Number, required: true },
    menugroup: { type: String, trim: true },
    pagename: { type: String, trim: true, required: true },
    pagelink: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, enum: ["link", "button"], default: "button" },
    parentslno: { type: Number, default: 0 },
    name: { type: String, trim: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

aiChatbotDefinitionSchema.index({ colid: 1, role: 1, slno: 1 }, { unique: true });

module.exports = mongoose.models.aichatbotdefinitionds || mongoose.model("aichatbotdefinitionds", aiChatbotDefinitionSchema);
