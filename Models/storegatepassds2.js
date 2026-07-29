const createModel = require("./purchase2genericmodel");

module.exports = createModel("storegatepassds2", {
  gatepassno: { type: String, trim: true, index: true },
  poid: { type: String, trim: true, index: true },
  vendorid: { type: String, trim: true },
  vendorname: { type: String, trim: true },
  receiveddate: { type: Date },
  receivedby: { type: String, trim: true },
  vehicle: { type: String, trim: true },
  challanno: { type: String, trim: true },
  invoiceno: { type: String, trim: true },
  status: { type: String, trim: true, default: "Received" },
  remarks: { type: String, trim: true }
});
