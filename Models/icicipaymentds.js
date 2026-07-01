const mongoose = require("mongoose");

const iciciPaymentSchema = new mongoose.Schema(
  {
    name: { type: String },
    user: { type: String },
    colid: { type: Number, required: true },
    student: { type: String, required: true },
    regno: { type: String, required: true },
    feeitem: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ["Student", "Event", "Admission"], default: "Student" },
    paymentfor: { type: String },
    applicationid: { type: String },
    source: { type: String },
    sourceid: { type: String },
    studentonlinepaymentid: { type: String },
    initiationdate: { type: Date, default: Date.now },
    paiddate: { type: Date },
    paidamount: { type: Number, default: 0 },
    refno: { type: String, required: true, unique: true },
    merchantTxnNo: { type: String },
    txnid: { type: String },
    description: { type: String },
    email: { type: String },
    phone: { type: String },
    status: { type: String, default: "INITIATED" },
    frontendcallbackurl: { type: String },
    gatewayresponse: { type: Object, default: {} }
  },
  { timestamps: true }
);

iciciPaymentSchema.index({ colid: 1, regno: 1 });
iciciPaymentSchema.index({ colid: 1, status: 1 });
iciciPaymentSchema.index({ colid: 1, applicationid: 1 });

const IciciPayment = mongoose.models.IciciPayment || mongoose.model("IciciPayment", iciciPaymentSchema);

module.exports = IciciPayment;
