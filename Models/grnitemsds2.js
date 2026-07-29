const createModel = require("./purchase2genericmodel");

module.exports = createModel("grnitemsds2", {
  grnno: { type: String, trim: true, index: true },
  grnid: { type: String, trim: true },
  poid: { type: String, trim: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  acceptedquantity: { type: Number, default: 0 },
  rejectedquantity: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  unit: { type: String, trim: true },
  remarks: { type: String, trim: true }
});
