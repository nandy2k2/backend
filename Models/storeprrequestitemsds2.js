const createModel = require("./purchase2genericmodel");

module.exports = createModel("storeprrequestitemsds2", {
  prnumber: { type: String, trim: true, index: true },
  prrequestid: { type: String, trim: true },
  itemid: { type: String, trim: true },
  itemcode: { type: String, trim: true },
  itemname: { type: String, trim: true },
  category: { type: String, trim: true },
  unit: { type: String, trim: true },
  quantity: { type: Number, default: 0 },
  estimatedprice: { type: Number, default: 0 },
  estimatedtotal: { type: Number, default: 0 },
  vendorid: { type: String, trim: true },
  vendorname: { type: String, trim: true },
  remarks: { type: String, trim: true }
});
