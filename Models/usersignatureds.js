const createModel = require("./purchase2genericmodel");

module.exports = createModel("usersignatureds", {
  username: { type: String, trim: true },
  useremail: { type: String, trim: true, index: true },
  signaturelink: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" },
  remarks: { type: String, trim: true }
});
