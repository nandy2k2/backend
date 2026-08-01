const createModel = require("./purchase2genericmodel");

module.exports = createModel("storepoapprovalworkflowds2", {
  level: { type: Number, default: 1 },
  approvername: { type: String, trim: true },
  approveremail: { type: String, trim: true, index: true },
  role: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  remarks: { type: String, trim: true }
});
