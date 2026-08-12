const createModel = require("./purchase2genericmodel");

module.exports = createModel("storequalitycheckitemsds2", {
  qcno: { type: String, trim: true, index: true },
  poid: { type: String, trim: true },
  gatepassno: { type: String, trim: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  itemdescription: { type: String, trim: true },
  unit: { type: String, trim: true },
  orderedquantity: { type: Number, default: 0 },
  poquantity: { type: Number, default: 0 },
  gatepassquantity: { type: Number, default: 0 },
  receivedquantity: { type: Number, default: 0 },
  approvedquantity: { type: Number, default: 0 },
  rejectedquantity: { type: Number, default: 0 },
  returnedquantity: { type: Number, default: 0 },
  returncategory: { type: String, trim: true },
  reason: { type: String, trim: true },
  remarks: { type: String, trim: true },
  status: { type: String, trim: true }
});
