const createModel = require("./purchase2genericmodel");

module.exports = createModel("storequalitycheckds2", {
  qcno: { type: String, trim: true, index: true },
  gatepassno: { type: String, trim: true },
  grnno: { type: String, trim: true },
  poid: { type: String, trim: true },
  vendorid: { type: String, trim: true },
  vendorname: { type: String, trim: true },
  storeid: { type: String, trim: true },
  storename: { type: String, trim: true },
  checkedby: { type: String, trim: true },
  checkedbyemail: { type: String, trim: true },
  inspectiondate: { type: Date },
  checkdate: { type: Date },
  billno: { type: String, trim: true },
  billdate: { type: Date },
  challanno: { type: String, trim: true },
  challandate: { type: Date },
  returncategory: { type: String, trim: true },
  attachmentlink: { type: String, trim: true },
  rejectedquantity: { type: Number, default: 0 },
  returnedquantity: { type: Number, default: 0 },
  totalrejectedquantity: { type: Number, default: 0 },
  totalreturnedquantity: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Pending" },
  remarks: { type: String, trim: true }
});
