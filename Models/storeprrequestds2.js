const createModel = require("./purchase2genericmodel");

module.exports = createModel("storeprrequestds2", {
  prnumber: { type: String, trim: true, index: true },
  storeid: { type: String, trim: true },
  storename: { type: String, trim: true },
  departmentname: { type: String, trim: true },
  requestdate: { type: Date },
  requestedby: { type: String, trim: true },
  requestedbyemail: { type: String, trim: true },
  priority: { type: String, trim: true },
  totalamount: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Pending" },
  remarks: { type: String, trim: true }
});
