const createModel = require("./purchase2genericmodel");

module.exports = createModel("storegatepassitemsds2", {
  gatepassno: { type: String, trim: true, index: true },
  poid: { type: String, trim: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  orderedquantity: { type: Number, default: 0 },
  receivedquantity: { type: Number, default: 0 },
  unit: { type: String, trim: true },
  remarks: { type: String, trim: true }
});
