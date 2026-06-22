const mongoose = require("mongoose");

const purchaseNewDeliveryScheduleSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  po: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewpurchaseorderds", required: true, index: true },
  poid: { type: String, required: true, trim: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "purchasenewvendords" },
  vendorname: { type: String, trim: true, default: "" },
  vendorusername: { type: String, trim: true, index: true },
  itemindex: { type: Number, default: 0 },
  item: { type: String, trim: true, default: "" },
  quantity: { type: Number, default: 0 },
  deliverydatetime: { type: Date },
  vehicledetails: { type: String, trim: true, default: "" },
  shipmentdetails: { type: String, trim: true, default: "" },
  remarks: { type: String, trim: true, default: "" },
  acceptedquantity: { type: Number, default: 0 },
  returnedquantity: { type: Number, default: 0 },
  qualityremarks: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Scheduled" },
  grnhash: { type: String, trim: true, default: "" },
  grnrecordid: { type: String, trim: true, default: "" },
  returnhash: { type: String, trim: true, default: "" },
  returnrecordid: { type: String, trim: true, default: "" }
}, { timestamps: true });

purchaseNewDeliveryScheduleSchema.index({ colid: 1, po: 1, vendorusername: 1 });

module.exports = mongoose.model("purchasenewdeliveryscheduleds", purchaseNewDeliveryScheduleSchema);
