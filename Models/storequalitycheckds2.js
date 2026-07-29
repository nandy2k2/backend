const createModel = require("./purchase2genericmodel");

module.exports = createModel("storequalitycheckds2", {
  qcno: { type: String, trim: true, index: true },
  gatepassno: { type: String, trim: true },
  grnno: { type: String, trim: true },
  poid: { type: String, trim: true },
  checkedby: { type: String, trim: true },
  checkedbyemail: { type: String, trim: true },
  checkdate: { type: Date },
  status: { type: String, trim: true, default: "Pending" },
  remarks: { type: String, trim: true }
});
