const mongoose = require("mongoose");

const base = {
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true, default: "" },
  name: { type: String, trim: true, default: "" },
  status: { type: String, trim: true, default: "Active" }
};

const vehicleTypeSchema = new mongoose.Schema({
  ...base,
  type: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: "" }
}, { timestamps: true });

const vehicleSchema = new mongoose.Schema({
  ...base,
  vehiclename: { type: String, trim: true, default: "" },
  registrationnumber: { type: String, trim: true, required: true },
  taxpaidtilldate: { type: Date },
  insurancevalidtilldate: { type: Date },
  typeid: { type: String, trim: true, default: "" },
  type: { type: String, trim: true, default: "" },
  vehicletype: { type: String, trim: true, enum: ["AC", "Non AC", ""], default: "" },
  seatingcapacity: { type: Number, default: 0 }
}, { timestamps: true });

const waypointSchema = new mongoose.Schema({
  ...base,
  waypoint: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: "" },
  location: { type: String, trim: true, default: "" },
  latitude: { type: String, trim: true, default: "" },
  longitude: { type: String, trim: true, default: "" }
}, { timestamps: true });

const routeSchema = new mongoose.Schema({
  ...base,
  routename: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: "" },
  waypoints: { type: Array, default: [] }
}, { timestamps: true });

const scheduleSchema = new mongoose.Schema({
  ...base,
  routeid: { type: String, trim: true, required: true },
  routename: { type: String, trim: true, default: "" },
  vehicleid: { type: String, trim: true, required: true },
  vehicle: { type: String, trim: true, default: "" },
  registrationnumber: { type: String, trim: true, default: "" },
  amountperseat: { type: Number, default: 0 },
  timings: { type: Array, default: [] }
}, { timestamps: true });

const applicationSchema = new mongoose.Schema({
  ...base,
  scheduleid: { type: String, trim: true, required: true },
  routeid: { type: String, trim: true, default: "" },
  routename: { type: String, trim: true, default: "" },
  vehicleid: { type: String, trim: true, default: "" },
  registrationnumber: { type: String, trim: true, default: "" },
  amountperseat: { type: Number, default: 0 },
  academicyear: { type: String, trim: true, default: "" },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  studentname: { type: String, trim: true, default: "" },
  studentemail: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, default: "" },
  approvalstatus: { type: String, trim: true, default: "Pending" },
  comments: { type: String, trim: true, default: "" },
  approvedby: { type: String, trim: true, default: "" },
  approveddate: { type: Date },
  ledgerid: { type: String, trim: true, default: "" }
}, { timestamps: true });

const assignmentSchema = new mongoose.Schema({
  ...base,
  applicationid: { type: String, trim: true, default: "" },
  scheduleid: { type: String, trim: true, required: true },
  routeid: { type: String, trim: true, default: "" },
  routename: { type: String, trim: true, default: "" },
  vehicleid: { type: String, trim: true, default: "" },
  registrationnumber: { type: String, trim: true, default: "" },
  amountperseat: { type: Number, default: 0 },
  academicyear: { type: String, trim: true, default: "" },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  studentname: { type: String, trim: true, default: "" },
  studentemail: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, default: "" },
  assignedby: { type: String, trim: true, default: "" },
  assigneddate: { type: Date, default: Date.now },
  ledgerid: { type: String, trim: true, default: "" }
}, { timestamps: true });

const templateSchema = new mongoose.Schema({
  ...base,
  templatename: { type: String, trim: true, required: true },
  description: { type: String, trim: true, default: "" },
  html: { type: String, default: "" },
  isdefault: { type: String, trim: true, default: "No" }
}, { timestamps: true });

const passSchema = new mongoose.Schema({
  ...base,
  assignmentid: { type: String, trim: true, default: "" },
  templateid: { type: String, trim: true, default: "" },
  templatename: { type: String, trim: true, default: "" },
  studentname: { type: String, trim: true, default: "" },
  studentemail: { type: String, trim: true, default: "" },
  regno: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  routename: { type: String, trim: true, default: "" },
  registrationnumber: { type: String, trim: true, default: "" },
  passhtml: { type: String, default: "" },
  qrid: { type: String, trim: true, default: "" }
}, { timestamps: true });

module.exports = {
  TransportVehicleType: mongoose.models.transportnewvehicletypeds || mongoose.model("transportnewvehicletypeds", vehicleTypeSchema),
  TransportVehicle: mongoose.models.transportnewvehicleds || mongoose.model("transportnewvehicleds", vehicleSchema),
  TransportWaypoint: mongoose.models.transportnewwaypointds || mongoose.model("transportnewwaypointds", waypointSchema),
  TransportRoute: mongoose.models.transportnewrouteds || mongoose.model("transportnewrouteds", routeSchema),
  TransportSchedule: mongoose.models.transportnewscheduleds || mongoose.model("transportnewscheduleds", scheduleSchema),
  TransportApplication: mongoose.models.transportnewapplicationds || mongoose.model("transportnewapplicationds", applicationSchema),
  TransportAssignment: mongoose.models.transportnewassignmentds || mongoose.model("transportnewassignmentds", assignmentSchema),
  TransportTemplate: mongoose.models.transportnewtemplateds || mongoose.model("transportnewtemplateds", templateSchema),
  TransportPass: mongoose.models.transportnewpassds || mongoose.model("transportnewpassds", passSchema)
};
