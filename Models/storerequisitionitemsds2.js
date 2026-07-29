const createModel = require("./purchase2genericmodel");

module.exports = createModel("storerequisitionitemsds2", {
  requisitionid: { type: String, trim: true, index: true },
  reqid: { type: String, trim: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  category: { type: String, trim: true },
  unit: { type: String, trim: true },
  quantity: { type: Number, default: 0 },
  approvedquantity: { type: Number, default: 0 },
  issuedquantity: { type: Number, default: 0 },
  remarks: { type: String, trim: true },
  status: { type: String, trim: true }
});
