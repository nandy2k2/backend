const HostelLightBill = require("../Models/hostellightbillds");
const HostelBuilding = require("../Models/hostelbuildingmapds");

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const dateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const regex = (value) => ({ $regex: text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const withBalance = (body = {}) => {
  const amount = number(body.amount);
  const paidamount = number(body.paidamount);
  const balanceamount = Math.max(amount - paidamount, 0);
  let status = text(body.status) || "Unpaid";
  if (paidamount <= 0) status = "Unpaid";
  else if (balanceamount > 0) status = "Partially Paid";
  else status = "Paid";
  return { amount, paidamount, balanceamount, status };
};

const payload = async (body = {}) => {
  const colid = number(body.colid);
  let building = null;
  if (body.buildingid) building = await HostelBuilding.findOne({ _id: body.buildingid, colid }).lean();
  const balance = withBalance(body);
  return {
    colid,
    buildingid: text(body.buildingid || building?._id),
    buildingname: text(body.buildingname || building?.buildingname),
    hosteltype: text(body.hosteltype || building?.hosteltype),
    guesttype: text(body.guesttype || building?.guesttype),
    billmonth: text(body.billmonth),
    billyear: text(body.billyear),
    billno: text(body.billno),
    billdate: dateOrNull(body.billdate),
    duedate: dateOrNull(body.duedate),
    units: number(body.units),
    amount: balance.amount,
    paidamount: balance.paidamount,
    balanceamount: balance.balanceamount,
    paymentdate: dateOrNull(body.paymentdate),
    paymentmode: text(body.paymentmode),
    paymentrefno: text(body.paymentrefno),
    status: balance.status,
    remarks: text(body.remarks),
    user: text(body.user)
  };
};

exports.options = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const buildings = await HostelBuilding.find({ colid, status: "Active" }).sort({ buildingname: 1 }).lean();
    const years = Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - 2 + index));
    res.json({ success: true, buildings, months, years, statuses: ["Unpaid", "Partially Paid", "Paid"] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBills = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const query = { colid };
    ["billmonth", "billyear", "status", "buildingid"].forEach((field) => {
      if (text(req.query[field])) query[field] = text(req.query[field]);
    });
    ["buildingname", "billno"].forEach((field) => {
      if (text(req.query[field])) query[field] = regex(req.query[field]);
    });
    const data = await HostelLightBill.find(query).sort({ billyear: -1, billmonth: 1, buildingname: 1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.saveBill = async (req, res) => {
  try {
    const data = await payload(req.body);
    if (!data.colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!data.buildingname || !data.billmonth || !data.billyear) {
      return res.status(400).json({ success: false, message: "Building, month and year are required" });
    }
    const saved = req.body.id || req.body._id
      ? await HostelLightBill.findOneAndUpdate({ _id: req.body.id || req.body._id, colid: data.colid }, data, { new: true })
      : await HostelLightBill.create(data);
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBill = async (req, res) => {
  try {
    const data = await HostelLightBill.findOneAndDelete({ _id: req.body.id || req.body._id, colid: number(req.body.colid) });
    if (!data) return res.status(404).json({ success: false, message: "Bill not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.report = async (req, res) => {
  try {
    const colid = number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const match = { colid };
    if (text(req.query.billyear)) match.billyear = text(req.query.billyear);
    if (text(req.query.buildingid)) match.buildingid = text(req.query.buildingid);
    const details = await HostelLightBill.find(match).sort({ billyear: -1, billmonth: 1, buildingname: 1 }).lean();
    const map = new Map();
    details.forEach((item) => {
      const key = `${item.billyear}-${item.billmonth}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          billyear: item.billyear,
          billmonth: item.billmonth,
          totalBills: 0,
          paidBills: 0,
          unpaidBills: 0,
          partiallyPaidBills: 0,
          totalAmount: 0,
          paidAmount: 0,
          balanceAmount: 0
        });
      }
      const row = map.get(key);
      row.totalBills += 1;
      if (item.status === "Paid") row.paidBills += 1;
      else if (item.status === "Partially Paid") row.partiallyPaidBills += 1;
      else row.unpaidBills += 1;
      row.totalAmount += number(item.amount);
      row.paidAmount += number(item.paidamount);
      row.balanceAmount += number(item.balanceamount);
    });
    res.json({ success: true, summary: Array.from(map.values()), details });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
