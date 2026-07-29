const mongoose = require("mongoose");

const leaveApprovalSchema = new mongoose.Schema(
  {
    level: { type: Number, default: 1 },
    approvername: { type: String, trim: true },
    approveremail: { type: String, trim: true },
    approverrole: { type: String, trim: true },
    status: { type: String, trim: true, default: "Pending" },
    comment: { type: String, trim: true },
    actiondate: { type: Date }
  },
  { _id: false }
);

const assignedClassSchema = new mongoose.Schema(
  {
    program: String,
    course: String,
    coursecode: String,
    classdate: String,
    classtime: String,
    period: String,
    topic: String
  },
  { _id: false }
);

const hrLeaveApplicationSchema = new mongoose.Schema(
  {
    cyclename: { type: String, trim: true },
    employeename: { type: String, trim: true },
    employeeemail: { type: String, trim: true, index: true },
    department: { type: String, trim: true },
    leavetype: { type: String, trim: true },
    fromdate: { type: String, trim: true },
    todate: { type: String, trim: true },
    days: { type: Number, default: 0 },
    vacationtype: { type: String, trim: true },
    component: { type: String, trim: true },
    source: { type: String, trim: true },
    reason: { type: String, trim: true },
    employeecomment: { type: String, trim: true },
    documentlink: { type: String, trim: true },
    classes: [assignedClassSchema],
    approvals: [leaveApprovalSchema],
    currentlevel: { type: Number, default: 1 },
    balancededucted: { type: Boolean, default: false },
    status: { type: String, trim: true, default: "Applied" },
    finalcomment: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrLeaveApplicationSchema.index({ colid: 1, employeeemail: 1, status: 1 });

module.exports = mongoose.model("hrleaveapplicationds", hrLeaveApplicationSchema);
