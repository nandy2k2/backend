const createModel = require("./purchase2genericmodel");

module.exports = createModel("storequalitycheckitemsds2", {
  qcno: { type: String, trim: true, index: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  receivedquantity: { type: Number, default: 0 },
  approvedquantity: { type: Number, default: 0 },
  rejectedquantity: { type: Number, default: 0 },
  returnedquantity: { type: Number, default: 0 },
  reason: { type: String, trim: true },
  status: { type: String, trim: true }
});
