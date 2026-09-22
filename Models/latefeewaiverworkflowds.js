const mongoose = require("mongoose");

const lateFeeWaiverWorkflowSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  level: { type: Number, required: true, default: 1 },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true },
  comments: { type: String, trim: true },
  active: { type: String, enum: ["Yes", "No"], default: "Yes" },
  user: { type: String, trim: true },
  name: { type: String, trim: true }
}, { timestamps: true });

lateFeeWaiverWorkflowSchema.index({ colid: 1, level: 1 }, { unique: true });

module.exports = mongoose.models.latefeewaiverworkflowds || mongoose.model("latefeewaiverworkflowds", lateFeeWaiverWorkflowSchema);
