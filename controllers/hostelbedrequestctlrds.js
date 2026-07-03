const HostelBuilding = require("../Models/hostelbuildingmapds");
const HostelRoom = require("../Models/hostelroommapds");
const HostelAssignment = require("../Models/hostelbedassignmentmapds");
const HostelBedRequest = require("../Models/hostelbedrequestds");
const User = require("../Models/user");

const text = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const regex = (value) => ({ $regex: text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });

const findStudent = async ({ colid, regno, user, email }) => {
  const query = { colid, role: /^Student$/i };
  if (regno) return User.findOne({ ...query, regno: text(regno) }).lean();
  if (user || email) return User.findOne({ ...query, email: text(user || email) }).lean();
  return null;
};

const roomVacancy = async (rooms) => {
  const roomIds = rooms.map((room) => room._id);
  const [assignments, requests] = await Promise.all([
    HostelAssignment.find({ roomid: { $in: roomIds }, status: "Active" }).lean(),
    HostelBedRequest.find({ roomid: { $in: roomIds }, status: { $in: ["Pending", "Approved"] } }).lean()
  ]);
  const occupied = new Map();
  assignments.forEach((item) => {
    const key = String(item.roomid);
    occupied.set(key, new Set([...(occupied.get(key) || []), Number(item.bedno)]));
  });
  requests.forEach((item) => {
    const key = String(item.roomid);
    occupied.set(key, new Set([...(occupied.get(key) || []), Number(item.bedno)]));
  });
  return rooms.map((room) => {
    const taken = occupied.get(String(room._id)) || new Set();
    const beds = Array.from({ length: Number(room.noofbeds) || 0 }, (_, index) => index + 1);
    const vacantbedslist = beds.filter((bed) => !taken.has(bed));
    return {
      ...room,
      occupiedbeds: taken.size,
      vacantbeds: vacantbedslist.length,
      vacantbedslist
    };
  });
};

exports.getBuildings = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await HostelBuilding.find({ colid, status: "Active" }).sort({ buildingname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getVacantBeds = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid, status: "Active" };
    if (req.query.buildingid) query.buildingid = req.query.buildingid;
    const rooms = await HostelRoom.find(query).sort({ buildingname: 1, block: 1, floor: 1, roomno: 1 }).lean();
    const data = (await roomVacancy(rooms)).filter((room) => room.vacantbeds > 0);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyHostelStatus = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const student = await findStudent({ colid, regno: req.query.regno, user: req.query.user, email: req.query.email });
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const [assignment, requests] = await Promise.all([
      HostelAssignment.findOne({ colid, regno: student.regno, status: "Active" }).lean(),
      HostelBedRequest.find({ colid, regno: student.regno }).sort({ createdAt: -1 }).lean()
    ]);
    res.json({ success: true, student, assignment, requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.applyForBed = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const bedno = toNumber(req.body.bedno);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!req.body.roomid || !bedno) return res.status(400).json({ success: false, message: "Room and bed are required" });
    const student = await findStudent({ colid, regno: req.body.regno, user: req.body.user, email: req.body.email });
    if (!student) return res.status(404).json({ success: false, message: "Student not found" });
    const activeAssignment = await HostelAssignment.findOne({ colid, regno: student.regno, status: "Active" });
    if (activeAssignment) return res.status(400).json({ success: false, message: "You are already allocated a hostel bed" });
    const activeRequest = await HostelBedRequest.findOne({ colid, regno: student.regno, status: { $in: ["Pending", "Approved"] } });
    if (activeRequest) return res.status(400).json({ success: false, message: "You have already applied for a hostel bed" });
    const room = await HostelRoom.findOne({ _id: req.body.roomid, colid, status: "Active" }).lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found" });
    if (bedno < 1 || bedno > Number(room.noofbeds || 0)) return res.status(400).json({ success: false, message: "Invalid bed number" });
    const occupied = await HostelAssignment.findOne({ colid, roomid: room._id, bedno, status: "Active" });
    if (occupied) return res.status(400).json({ success: false, message: "This bed is already allocated" });
    const requested = await HostelBedRequest.findOne({ colid, roomid: room._id, bedno, status: { $in: ["Pending", "Approved"] } });
    if (requested) return res.status(400).json({ success: false, message: "This bed already has a pending request" });
    const data = await HostelBedRequest.create({
      colid,
      buildingid: room.buildingid,
      roomid: room._id,
      buildingname: room.buildingname,
      hosteltype: room.hosteltype,
      guesttype: room.guesttype,
      block: room.block,
      floor: room.floor,
      roomno: room.roomno,
      roomtype: room.roomtype,
      residenttype: room.residenttype,
      bedno,
      studentid: student._id,
      student: student.name,
      studentemail: student.email,
      studentphone: student.phone,
      program: student.program || student.degree || "",
      programcode: student.programcode,
      regno: student.regno,
      status: "Pending",
      user: text(req.body.user || student.email)
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRequests = async (req, res) => {
  try {
    const colid = toNumber(req.query.colid);
    const query = { colid };
    ["status", "buildingname", "block", "floor", "roomno", "programcode"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    ["student", "studentemail", "regno"].forEach((field) => {
      if (text(req.query[field])) query[field] = regex(req.query[field]);
    });
    const data = await HostelBedRequest.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.actionRequest = async (req, res) => {
  try {
    const colid = toNumber(req.body.colid);
    const action = text(req.body.action);
    const request = await HostelBedRequest.findOne({ _id: req.body.id, colid });
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "Pending") return res.status(400).json({ success: false, message: "Only pending requests can be processed" });
    if (action === "Reject") {
      request.status = "Rejected";
      request.comments = text(req.body.comments);
      request.approveddate = new Date();
      request.approvedby = text(req.body.user);
      request.approvedbyname = text(req.body.name);
      await request.save();
      return res.json({ success: true, data: request });
    }
    if (action !== "Approve") return res.status(400).json({ success: false, message: "Invalid action" });
    const existingStudentAssignment = await HostelAssignment.findOne({ colid, regno: request.regno, status: "Active" });
    if (existingStudentAssignment) return res.status(400).json({ success: false, message: "Student is already allocated a bed" });
    const occupied = await HostelAssignment.findOne({ colid, roomid: request.roomid, bedno: request.bedno, status: "Active" });
    if (occupied) return res.status(400).json({ success: false, message: "Bed is already allocated" });
    const room = await HostelRoom.findOne({ _id: request.roomid, colid }).lean();
    if (!room) return res.status(404).json({ success: false, message: "Room not found" });
    const assignment = await HostelAssignment.create({
      buildingid: request.buildingid,
      roomid: request.roomid,
      buildingname: request.buildingname,
      hosteltype: request.hosteltype,
      guesttype: request.guesttype,
      block: request.block,
      floor: request.floor,
      roomno: request.roomno,
      roomtype: request.roomtype,
      residenttype: request.residenttype,
      bedno: request.bedno,
      studentid: request.studentid,
      student: request.student,
      studentemail: request.studentemail,
      studentphone: request.studentphone,
      programcode: request.programcode,
      program: request.program,
      regno: request.regno,
      status: "Active",
      colid,
      user: text(req.body.user)
    });
    request.status = "Approved";
    request.comments = text(req.body.comments);
    request.approveddate = new Date();
    request.approvedby = text(req.body.user);
    request.approvedbyname = text(req.body.name);
    request.assignmentid = String(assignment._id);
    await request.save();
    await HostelBedRequest.updateMany(
      { _id: { $ne: request._id }, colid, roomid: request.roomid, bedno: request.bedno, status: "Pending" },
      { $set: { status: "Rejected", comments: "Bed allocated to another student", approveddate: new Date(), approvedby: text(req.body.user), approvedbyname: text(req.body.name) } }
    );
    res.json({ success: true, data: request, assignment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
