const createModel = require("./purchase2genericmodel");

module.exports = createModel("purchase2mailconfigds2", {
  eventname: { type: String, trim: true, index: true },
  managername: { type: String, trim: true },
  manageremail: { type: String, trim: true },
  ccemail: { type: String, trim: true },
  subjecttemplate: { type: String, trim: true },
  bodytemplate: { type: String, trim: true },
  active: { type: String, trim: true, default: "Yes" },
  remarks: { type: String, trim: true }
});
