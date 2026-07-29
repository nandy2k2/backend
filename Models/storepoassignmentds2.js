const createModel = require("./purchase2genericmodel");

module.exports = createModel("storepoassignmentds2", {
  requestid: { type: String, trim: true },
  prnumber: { type: String, trim: true },
  assignedto: { type: String, trim: true },
  assignedtoemail: { type: String, trim: true, index: true },
  assignedby: { type: String, trim: true },
  assignedbyemail: { type: String, trim: true },
  assigneddate: { type: Date },
  status: { type: String, trim: true, default: "Assigned" },
  remarks: { type: String, trim: true }
});
