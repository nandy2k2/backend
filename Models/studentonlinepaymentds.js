const mongoose = require("mongoose");

const studentOnlinePaymentItemSchema = new mongoose.Schema(
  {
    ledgerid: { type: String },
    academicyear: { type: String },
    feegroup: { type: String },
    feeitem: { type: String },
    feecategory: { type: String },
    feetype: { type: String },
    semester: { type: String },
    amount: { type: Number, default: 0 },
    paidbefore: { type: Number, default: 0 },
    balancebefore: { type: Number, default: 0 },
    payingamount: { type: Number, default: 0 },
    paidafter: { type: Number, default: 0 },
    balanceafter: { type: Number, default: 0 }
  },
  { _id: false }
);

const studentOnlinePaymentSchema = new mongoose.Schema(
  {
    name: { type: String },
    user: { type: String },
    colid: { type: Number, required: true },
    student: { type: String },
    regno: { type: String, required: true },
    studentemail: { type: String },
    phone: { type: String },
    program: { type: String },
    programcode: { type: String },
    regulation: { type: String },
    academicyear: { type: String },
    semester: { type: String },
    section: { type: String },
    gateway: { type: String },
    gatewaytype: { type: String },
    refno: { type: String },
    gatewayrefno: { type: String },
    description: { type: String },
    totalamount: { type: Number, default: 0 },
    paidamount: { type: Number, default: 0 },
    initiationdate: { type: Date, default: Date.now },
    paiddate: { type: Date },
    paymentstatus: { type: String, default: "Initiated" },
    ledgeritems: { type: [studentOnlinePaymentItemSchema], default: [] },
    gatewayresponse: { type: Object, default: {} }
  },
  { timestamps: true }
);

studentOnlinePaymentSchema.index({ colid: 1, regno: 1 });
studentOnlinePaymentSchema.index({ colid: 1, paymentstatus: 1 });
studentOnlinePaymentSchema.index({ colid: 1, paiddate: 1 });
studentOnlinePaymentSchema.index({ refno: 1 });

module.exports = mongoose.models.studentonlinepaymentds || mongoose.model("studentonlinepaymentds", studentOnlinePaymentSchema);
