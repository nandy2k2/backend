const mongoose = require("mongoose");

const baseFields = {
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  name: { type: String, trim: true }
};

const schemaOptions = { timestamps: true, strict: false };

const EstateRealEstateTypeSchema = new mongoose.Schema({
  ...baseFields,
  typename: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateRealEstateSchema = new mongoose.Schema({
  ...baseFields,
  estatename: { type: String, trim: true, required: true },
  estatecode: { type: String, trim: true },
  estatetype: { type: String, trim: true },
  location: { type: String, trim: true },
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  pincode: { type: String, trim: true },
  area: { type: Number, default: 0 },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateServiceTypeSchema = new mongoose.Schema({
  ...baseFields,
  servicetype: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateMaintenanceScheduleSchema = new mongoose.Schema({
  ...baseFields,
  estateid: { type: String, trim: true },
  estatename: { type: String, trim: true },
  estatecode: { type: String, trim: true },
  estatetype: { type: String, trim: true },
  location: { type: String, trim: true },
  servicedate: { type: String, trim: true },
  starttime: { type: String, trim: true },
  endtime: { type: String, trim: true },
  frequency: { type: String, trim: true },
  servicetype: { type: String, trim: true },
  hours: { type: Number, default: 0 },
  noofpeople: { type: Number, default: 1 },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Planned" }
}, schemaOptions);

const EstateServiceProviderSchema = new mongoose.Schema({
  ...baseFields,
  servicetype: { type: String, trim: true },
  providername: { type: String, trim: true, required: true },
  providertype: { type: String, trim: true, default: "Inhouse" },
  contactperson: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateVendorContractSchema = new mongoose.Schema({
  ...baseFields,
  providerid: { type: String, trim: true },
  providername: { type: String, trim: true },
  servicetype: { type: String, trim: true },
  contracttype: { type: String, trim: true },
  startdate: { type: String, trim: true },
  enddate: { type: String, trim: true },
  amount: { type: Number, default: 0 },
  description: { type: String, trim: true },
  documentlink: { type: String, trim: true },
  filename: { type: String, trim: true },
  originalname: { type: String, trim: true },
  mimetype: { type: String, trim: true },
  size: { type: Number, default: 0 },
  bucket: { type: String, trim: true },
  region: { type: String, trim: true },
  key: { type: String, trim: true },
  awsconfigid: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateServiceAllocationSchema = new mongoose.Schema({
  ...baseFields,
  providerid: { type: String, trim: true },
  providername: { type: String, trim: true },
  servicetype: { type: String, trim: true },
  employeename: { type: String, trim: true },
  employeeemail: { type: String, trim: true },
  employeephone: { type: String, trim: true },
  department: { type: String, trim: true },
  role: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateServiceShiftSchema = new mongoose.Schema({
  ...baseFields,
  allocationid: { type: String, trim: true },
  servicetype: { type: String, trim: true },
  employeename: { type: String, trim: true },
  employeeemail: { type: String, trim: true },
  shiftid: { type: String, trim: true },
  location: { type: String, trim: true },
  shift: { type: String, trim: true },
  starttime: { type: String, trim: true },
  endtime: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateDailyRosterSchema = new mongoose.Schema({
  ...baseFields,
  rosterdate: { type: String, trim: true },
  estateid: { type: String, trim: true },
  estatename: { type: String, trim: true },
  estatecode: { type: String, trim: true },
  location: { type: String, trim: true },
  servicetype: { type: String, trim: true },
  employeename: { type: String, trim: true },
  employeeemail: { type: String, trim: true },
  shift: { type: String, trim: true },
  starttime: { type: String, trim: true },
  endtime: { type: String, trim: true },
  hours: { type: Number, default: 0 },
  source: { type: String, trim: true, default: "Manual" },
  notes: { type: String, trim: true },
  status: { type: String, trim: true, default: "Planned" }
}, schemaOptions);

const EstateMeetingRoomFeatureSchema = new mongoose.Schema({
  ...baseFields,
  feature: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateMeetingRoomSchema = new mongoose.Schema({
  ...baseFields,
  buildingid: { type: String, trim: true },
  building: { type: String, trim: true },
  location: { type: String, trim: true },
  roomname: { type: String, trim: true, required: true },
  roomcode: { type: String, trim: true },
  ownername: { type: String, trim: true },
  owneremail: { type: String, trim: true },
  capacity: { type: Number, default: 0 },
  features: [{ type: String, trim: true }],
  status: { type: String, trim: true, default: "Active" }
}, schemaOptions);

const EstateMeetingRoomBookingSchema = new mongoose.Schema({
  ...baseFields,
  roomid: { type: String, trim: true },
  roomname: { type: String, trim: true },
  roomcode: { type: String, trim: true },
  building: { type: String, trim: true },
  location: { type: String, trim: true },
  meetingtitle: { type: String, trim: true, required: true },
  bookedbyname: { type: String, trim: true },
  bookedbyemail: { type: String, trim: true },
  bookingdate: { type: String, trim: true },
  fromtime: { type: String, trim: true },
  totime: { type: String, trim: true },
  capacityrequired: { type: Number, default: 0 },
  featuresrequired: [{ type: String, trim: true }],
  sharedservices: [{ type: String, trim: true }],
  sharedservicedetails: [{
    service: { type: String, trim: true },
    noofpeople: { type: Number, default: 1 }
  }],
  purpose: { type: String, trim: true },
  status: { type: String, trim: true, default: "Booked" }
}, schemaOptions);

module.exports = {
  EstateRealEstateType: mongoose.models.estaterealestatetypeds || mongoose.model("estaterealestatetypeds", EstateRealEstateTypeSchema),
  EstateRealEstate: mongoose.models.estaterealestateds || mongoose.model("estaterealestateds", EstateRealEstateSchema),
  EstateServiceType: mongoose.models.estateservicetypeds || mongoose.model("estateservicetypeds", EstateServiceTypeSchema),
  EstateMaintenanceSchedule: mongoose.models.estatemaintenancescheduleds || mongoose.model("estatemaintenancescheduleds", EstateMaintenanceScheduleSchema),
  EstateServiceProvider: mongoose.models.estateserviceproviderds || mongoose.model("estateserviceproviderds", EstateServiceProviderSchema),
  EstateVendorContract: mongoose.models.estatevendorcontractds || mongoose.model("estatevendorcontractds", EstateVendorContractSchema),
  EstateServiceAllocation: mongoose.models.estateserviceallocationds || mongoose.model("estateserviceallocationds", EstateServiceAllocationSchema),
  EstateServiceShift: mongoose.models.estateserviceshiftds || mongoose.model("estateserviceshiftds", EstateServiceShiftSchema),
  EstateDailyRoster: mongoose.models.estatedailyrosterds || mongoose.model("estatedailyrosterds", EstateDailyRosterSchema),
  EstateMeetingRoomFeature: mongoose.models.estatemeetingroomfeatureds || mongoose.model("estatemeetingroomfeatureds", EstateMeetingRoomFeatureSchema),
  EstateMeetingRoom: mongoose.models.estatemeetingroomds || mongoose.model("estatemeetingroomds", EstateMeetingRoomSchema),
  EstateMeetingRoomBooking: mongoose.models.estatemeetingroombookingds || mongoose.model("estatemeetingroombookingds", EstateMeetingRoomBookingSchema)
};
