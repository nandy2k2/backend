const mongoose = require("mongoose");

const programTransferLogSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    studentid: { type: String, trim: true, index: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    olddetails: { type: Object, default: {} },
    newdetails: { type: Object, default: {} },
    transferredby: { type: String, trim: true },
    transferdate: { type: Date, default: Date.now },
    remarks: { type: String, trim: true }
  },
  { timestamps: true }
);

programTransferLogSchema.index({ colid: 1, transferdate: -1 });
programTransferLogSchema.index({ colid: 1, academicyear: 1 });

module.exports = mongoose.models.programtransferlogds || mongoose.model("programtransferlogds", programTransferLogSchema);
