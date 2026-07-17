const mongoose = require("mongoose");

const feeTransferLogSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    programtransferid: { type: String, trim: true, index: true },
    studentid: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    oldacademicyear: { type: String, trim: true },
    oldprogram: { type: String, trim: true },
    oldprogramcode: { type: String, trim: true },
    newacademicyear: { type: String, trim: true },
    newprogram: { type: String, trim: true },
    newprogramcode: { type: String, trim: true },
    totaloldpaid: { type: Number, default: 0 },
    totalnewfees: { type: Number, default: 0 },
    allocatedcredit: { type: Number, default: 0 },
    administrativecharges: { type: Number, default: 0 },
    refundamount: { type: Number, default: 0 },
    refundmode: { type: String, trim: true },
    refundrefno: { type: String, trim: true },
    refunddate: { type: Date },
    oldledgeritems: { type: Array, default: [] },
    newfeeitems: { type: Array, default: [] },
    createdledgerids: { type: [String], default: [] },
    transferdate: { type: Date, default: Date.now },
    createdby: { type: String, trim: true },
    remarks: { type: String, trim: true }
  },
  { timestamps: true }
);

feeTransferLogSchema.index({ colid: 1, transferdate: -1 });
feeTransferLogSchema.index({ colid: 1, newacademicyear: 1, newprogramcode: 1 });

module.exports = mongoose.models.feetransferlogds || mongoose.model("feetransferlogds", feeTransferLogSchema);
