const mongoose = require("mongoose");

const base = {
  colid: { type: Number, index: true },
  user: { type: String, default: "" },
  name: { type: String, default: "" }
};

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, new mongoose.Schema(schema, { timestamps: true, strict: false }));

const EventNew = model("eventneweventds", {
  ...base,
  eventname: String,
  eventcode: { type: String, index: true },
  type: String,
  mode: String,
  academicyear: String,
  startdate: Date,
  enddate: Date,
  venue: String,
  description: String,
  registrationstartdate: Date,
  registrationenddate: Date,
  status: { type: String, default: "Active" },
  publicregistration: { type: String, default: "Yes" },
  certificateenabled: { type: String, default: "Yes" },
  feedbackrequired: { type: String, default: "Yes" }
});

const AttendeeNew = model("eventnewattendeeds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  eventname: String,
  eventcode: String,
  registrationtype: String,
  role: String,
  attendee: String,
  email: String,
  phone: String,
  gender: String,
  designation: String,
  institution: String,
  city: String,
  state: String,
  country: String,
  needsaccommodation: { type: String, default: "No" },
  occupancytype: { type: String, default: "Single" },
  needstransport: { type: String, default: "No" },
  pickuprequired: { type: String, default: "No" },
  droprequired: { type: String, default: "No" },
  status: { type: String, default: "Applied" },
  approvedby: String,
  approveddate: Date,
  comments: String
});

const DistinguishedAttendeeNew = model("eventnewdistinguishedattendeeds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  eventname: String,
  eventcode: String,
  attendee: String,
  email: String,
  phone: String,
  gender: String,
  designation: String,
  institution: String,
  protocol: String,
  remarks: String,
  status: { type: String, default: "Confirmed" }
});

const GuestHouseBuildingNew = model("eventnewguesthousebuildingds", {
  ...base,
  building: String,
  description: String,
  type: String,
  location: String,
  status: { type: String, default: "Active" }
});

const GuestHouseRoomNew = model("eventnewguesthouseroomds", {
  ...base,
  building: String,
  floor: String,
  roomno: String,
  roomtype: String,
  occupancytype: String,
  genderpreference: String,
  rentperday: { type: Number, default: 0 },
  noofbeds: { type: Number, default: 1 },
  status: { type: String, default: "Active" }
});

const GuestHouseReservationNew = model("eventnewguesthousereservationds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  eventname: String,
  eventcode: String,
  building: String,
  floor: String,
  roomno: String,
  roomtype: String,
  occupancytype: String,
  guestname: String,
  guestemail: String,
  gender: String,
  fromdate: Date,
  todate: Date,
  status: { type: String, default: "Reserved" },
  allocationmode: { type: String, default: "Manual" },
  remarks: String
});

const VehicleNew = model("eventnewvehicleds", {
  ...base,
  vehicleno: String,
  vehiclename: String,
  vehicletype: String,
  capacity: { type: Number, default: 0 },
  drivername: String,
  driverphone: String,
  status: { type: String, default: "Available" },
  remarks: String
});

const TransportRequirementNew = model("eventnewtransportrequirementds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  eventname: String,
  eventcode: String,
  attendeeid: String,
  attendee: String,
  email: String,
  requirementtype: String,
  vehicletype: String,
  passengercount: { type: Number, default: 1 },
  location: String,
  destination: String,
  requirementdate: Date,
  requirementtime: String,
  status: { type: String, default: "Pending" },
  remarks: String
});

const VehicleAllocationNew = model("eventnewvehicleallocationds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  eventname: String,
  eventcode: String,
  requirementid: String,
  attendee: String,
  email: String,
  requirementtype: String,
  vehicleno: String,
  vehiclename: String,
  vehicletype: String,
  drivername: String,
  driverphone: String,
  allocationdate: Date,
  allocationtime: String,
  location: String,
  destination: String,
  allocationmode: { type: String, default: "Manual" },
  status: { type: String, default: "Allocated" },
  remarks: String
});

const EventFeedbackNew = model("eventnewfeedbackds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  attendeeid: String,
  eventname: String,
  eventcode: String,
  attendee: String,
  email: String,
  rating: { type: Number, default: 5 },
  contentquality: { type: Number, default: 5 },
  hospitality: { type: Number, default: 5 },
  logistics: { type: Number, default: 5 },
  comments: String,
  submitteddate: Date
});

const EventCertificateNew = model("eventnewcertificateds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  attendeeid: String,
  eventname: String,
  eventcode: String,
  attendee: String,
  email: String,
  certificateno: String,
  issuedate: Date,
  certificatehtml: String,
  status: { type: String, default: "Issued" }
});

const EventPaperSubmissionNew = model("eventnewpapersubmissionds", {
  ...base,
  eventid: { type: mongoose.Schema.Types.ObjectId, ref: "eventneweventds", index: true },
  attendeeid: String,
  eventname: String,
  eventcode: String,
  attendee: String,
  email: String,
  phone: String,
  papertitle: String,
  authors: String,
  abstract: String,
  keywords: String,
  paperlink: String,
  paperfilename: String,
  submitteddate: Date,
  status: { type: String, default: "Submitted" },
  remarks: String
});

module.exports = {
  EventNew,
  AttendeeNew,
  DistinguishedAttendeeNew,
  GuestHouseBuildingNew,
  GuestHouseRoomNew,
  GuestHouseReservationNew,
  VehicleNew,
  TransportRequirementNew,
  VehicleAllocationNew,
  EventFeedbackNew,
  EventCertificateNew,
  EventPaperSubmissionNew
};
