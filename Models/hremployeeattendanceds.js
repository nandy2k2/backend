const mongoose = require("mongoose");

const attendanceApprovalSchema = new mongoose.Schema(
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

const hrEmployeeAttendanceSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    month: { type: String, trim: true, required: true },
    date: { type: String, trim: true, required: true },
    employeename: { type: String, trim: true, required: true },
    employeeemail: { type: String, trim: true, required: true, index: true },
    role: { type: String, trim: true },
    attendance: { type: Number, default: 1 },
    status: { type: String, trim: true, default: "Present" },
    intime: { type: String, trim: true },
    outtime: { type: String, trim: true },
    islate: { type: String, trim: true, default: "No" },
    isearly: { type: String, trim: true, default: "No" },
    isovertime: { type: String, trim: true, default: "No" },
    overtimerate: { type: Number, default: 0 },
    latesalarydeduction: { type: Number, default: 0 },
    netsalary: { type: Number, default: 0 },
    approvalstatus: { type: String, trim: true, default: "Pending" },
    actiontype: { type: String, trim: true, default: "Add" },
    approvals: [attendanceApprovalSchema],
    currentlevel: { type: Number, default: 1 },
    finalcomment: { type: String, trim: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

hrEmployeeAttendanceSchema.index({ colid: 1, academicyear: 1, month: 1, employeeemail: 1, date: 1 });

module.exports = mongoose.model("hremployeeattendanceds", hrEmployeeAttendanceSchema);
