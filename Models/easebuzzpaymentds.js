const mongoose = require("mongoose");

const easebuzzPaymentSchema = new mongoose.Schema(
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
    description: { type: String },
    email: { type: String },
    phone: { type: String },
    frontendcallbackurl: { type: String },
    status: { type: String, default: "INITIATED" },
    gatewayresponse: { type: Object, default: {} }
  },
  { timestamps: true }
);

easebuzzPaymentSchema.index({ colid: 1, regno: 1 });
easebuzzPaymentSchema.index({ colid: 1, status: 1 });

const EasebuzzPayment = mongoose.models.EasebuzzPayment || mongoose.model("EasebuzzPayment", easebuzzPaymentSchema);

module.exports = EasebuzzPayment;
