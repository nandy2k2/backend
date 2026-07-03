const mongoose = require("mongoose");

const hostelLightBillSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    buildingid: { type: String },
    buildingname: { type: String, trim: true, required: true },
    hosteltype: { type: String, trim: true },
    guesttype: { type: String, trim: true },
    billmonth: { type: String, trim: true, required: true },
    billyear: { type: String, trim: true, required: true },
    billno: { type: String, trim: true },
    billdate: { type: Date },
    duedate: { type: Date },
    units: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    paidamount: { type: Number, default: 0 },
    balanceamount: { type: Number, default: 0 },
    paymentdate: { type: Date },
    paymentmode: { type: String, trim: true },
    paymentrefno: { type: String, trim: true },
    status: { type: String, default: "Unpaid" },
    remarks: { type: String },
    user: { type: String }
  },
  { timestamps: true }
);

hostelLightBillSchema.index({ colid: 1, buildingname: 1, billyear: 1, billmonth: 1 });

module.exports = mongoose.models.hostellightbillds || mongoose.model("hostellightbillds", hostelLightBillSchema);
