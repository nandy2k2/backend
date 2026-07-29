const createModel = require("./purchase2genericmodel");

module.exports = createModel("departmentindentds2", {
  department: { type: String, trim: true },
  departmentcode: { type: String, trim: true },
  hodname: { type: String, trim: true },
  hodemail: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  remarks: { type: String, trim: true }
});
