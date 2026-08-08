const Ledgerstud = require("../Models/ledgerstud");
const MasterGateway = require("../Models/mastergatewayds");
const StudentOnlinePayment = require("../Models/studentonlinepaymentds");
const IciciPayment = require("../Models/icicipaymentds");

function text(value) {
  return String(value || "").trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function regex(value) {
  return { $regex: text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
}

function pendingBalance(row = {}) {
  return Math.max(0, number(row.balance));
}

function feeItemSnapshot(row, payingAmount) {
  const paidbefore = number(row.paid);
  const balancebefore = pendingBalance(row);
  return {
    ledgerid: String(row._id),
    academicyear: text(row.academicyear),
    feegroup: text(row.feegroup),
    feeitem: text(row.feeitem),
    feecategory: text(row.feecategory),
    feetype: text(row.feetype),
    semester: text(row.semester),
    amount: number(row.amount),
    paidbefore,
    balancebefore,
    payingamount: Math.min(number(payingAmount), balancebefore)
  };
}

function isSuccessfulGatewayPayment(payment = {}) {
  const status = text(payment.status).toUpperCase();
  return ["SUCCESS", "SUCCESSFUL", "PAID"].includes(status);
}

function isSettledOnlineStatus(status) {
  return ["SUCCESS", "PAID"].includes(text(status).toUpperCase());
}

function reportQuery(source = {}) {
  const query = { colid: Number(source.colid) };
  ["regno", "paymentstatus", "gateway", "academicyear", "programcode", "semester"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  ["student", "studentemail", "phone"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  if (text(source.feegroup)) query["ledgeritems.feegroup"] = text(source.feegroup);
  if (text(source.feeitem)) query["ledgeritems.feeitem"] = regex(source.feeitem);
  const from = text(source.fromdate);
  const to = text(source.todate);
  if (from || to) {
    query.paiddate = {};
    if (from) query.paiddate.$gte = new Date(`${from}T00:00:00`);
    if (to) query.paiddate.$lte = new Date(`${to}T23:59:59`);
  }
  return query;
}

exports.getPendingStudentFees = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    const regno = text(req.query.regno);
    if (!colid || !regno) return res.status(400).json({ success: false, message: "colid and regno are required" });
    await exports.reconcileSuccessfulStudentOnlinePayments({ colid, regno });
    const rows = await Ledgerstud.find({ colid, regno, balance: { $gt: 0 } }).sort({ academicyear: 1, feegroup: 1, feeitem: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createStudentPaymentSession = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const regno = text(req.body.regno);
    const gatewayid = text(req.body.gatewayid);
    const ledgerids = Array.isArray(req.body.ledgerids) ? req.body.ledgerids.map(text).filter(Boolean) : [];
    if (!colid || !regno || !gatewayid || ledgerids.length === 0) {
      return res.status(400).json({ success: false, message: "colid, regno, gateway and selected fee items are required" });
    }

    const gateway = await MasterGateway.findOne({ _id: gatewayid, colid, status: "Active" }).lean();
    if (!gateway) return res.status(404).json({ success: false, message: "Active payment gateway not found" });

    const ledgerRows = await Ledgerstud.find({ _id: { $in: ledgerids }, colid, regno, balance: { $gt: 0 } }).lean();
    if (ledgerRows.length === 0) return res.status(400).json({ success: false, message: "No pending fee items found for payment" });

    const ledgeritems = ledgerRows.map((row) => feeItemSnapshot(row, row.balance));
    const totalamount = ledgeritems.reduce((sum, item) => sum + number(item.payingamount), 0);
    if (totalamount <= 0) return res.status(400).json({ success: false, message: "Total payable amount must be greater than zero" });

    const first = ledgerRows[0] || {};
    const refno = `STUFEE_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const payment = await StudentOnlinePayment.create({
      name: text(req.body.name),
      user: text(req.body.user),
      colid,
      student: text(req.body.student) || text(first.student),
      regno,
      studentemail: text(req.body.email || req.body.studentemail || first.user),
      phone: text(req.body.phone),
      program: text(req.body.program || first.program),
      programcode: text(req.body.programcode || first.programcode),
      regulation: text(req.body.regulation || first.regulation),
      academicyear: text(req.body.academicyear || first.academicyear),
      semester: text(req.body.semester || first.semester),
      section: text(req.body.section),
      gateway: text(gateway.gatewayname),
      gatewaytype: text(gateway.type),
      refno,
      totalamount,
      description: text(req.body.description) || `Online student fee payment for ${regno}`,
      ledgeritems
    });

    res.json({
      success: true,
      data: {
        payment,
        gateway,
        gatewayPayload: {
          colid,
          student: payment.student || regno,
          regno,
          feeitem: `Student Fees - ${ledgeritems.length} item(s)`,
          amount: totalamount,
          type: "Student",
          email: payment.studentemail,
          phone: payment.phone,
          description: payment.description,
          source: "StudentFeesOnline",
          sourceid: String(payment._id),
          studentonlinepaymentid: String(payment._id)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.settleSuccessfulStudentOnlinePayment = async (payment, gatewayParams = {}) => {
  if (!isSuccessfulGatewayPayment(payment)) return null;
  const sourceId = text(payment?.studentonlinepaymentid || payment?.sourceid);
  if (!sourceId && text(payment?.source) !== "StudentFeesOnline") return null;
  const onlinePayment = await StudentOnlinePayment.findOne({
    _id: sourceId,
    colid: Number(payment.colid)
  });
  if (!onlinePayment || isSettledOnlineStatus(onlinePayment.paymentstatus)) return onlinePayment;

  const paiddate = new Date();
  const updatedItems = [];
  for (const item of onlinePayment.ledgeritems || []) {
    const ledger = await Ledgerstud.findOne({ _id: item.ledgerid, colid: onlinePayment.colid, regno: onlinePayment.regno });
    if (!ledger) {
      updatedItems.push(item);
      continue;
    }
    const beforePaid = number(ledger.paid);
    const beforeBalance = pendingBalance(ledger);
    const payable = Math.min(number(item.payingamount), beforeBalance);
    ledger.paid = beforePaid + payable;
    ledger.balance = Math.max(0, beforeBalance - payable);
    ledger.pg = number(ledger.pg) + payable;
    ledger.paymode = text(onlinePayment.gateway) || "Online";
    ledger.paydetails = text(payment.refno || payment.gatewayrefno || onlinePayment.refno);
    ledger.paiddate = paiddate;
    if (ledger.balance <= 0 && text(ledger.status).toLowerCase() !== "active") ledger.status = "Active";
    await ledger.save({ validateBeforeSave: false });
    updatedItems.push({
      ...item.toObject?.() || item,
      paidbefore: beforePaid,
      balancebefore: beforeBalance,
      paidafter: ledger.paid,
      balanceafter: ledger.balance
    });
  }

  onlinePayment.paymentstatus = "Paid";
  onlinePayment.paiddate = paiddate;
  onlinePayment.paidamount = number(payment.paidamount || onlinePayment.totalamount);
  onlinePayment.gatewayrefno = text(payment.refno || payment.txnid || payment.merchantTxnNo);
  onlinePayment.ledgeritems = updatedItems;
  onlinePayment.gatewayresponse = gatewayParams || {};
  await onlinePayment.save();
  return onlinePayment;
};

exports.reconcileSuccessfulStudentOnlinePayments = async ({ colid, regno, id } = {}) => {
  const query = {
    colid: Number(colid),
    status: { $in: ["SUCCESS", "SUCCESSFUL", "PAID"] },
    $or: [
      { source: "StudentFeesOnline" },
      { studentonlinepaymentid: { $exists: true, $ne: "" } },
      { sourceid: { $exists: true, $ne: "" } }
    ]
  };
  if (text(regno)) query.regno = text(regno);
  if (text(id)) query.$or = [{ studentonlinepaymentid: text(id) }, { sourceid: text(id) }];
  const payments = await IciciPayment.find(query).sort({ paiddate: -1, updatedAt: -1 }).limit(50).lean();
  const settled = [];
  for (const payment of payments) {
    const result = await exports.settleSuccessfulStudentOnlinePayment(payment, payment.gatewayresponse?.callbackResponse || payment.gatewayresponse || {});
    if (result) settled.push(result);
  }
  return settled;
};

exports.markFailedStudentOnlinePayment = async (payment, gatewayParams = {}) => {
  const sourceId = text(payment?.studentonlinepaymentid || payment?.sourceid);
  if (!sourceId && text(payment?.source) !== "StudentFeesOnline") return null;
  const onlinePayment = await StudentOnlinePayment.findOne({
    _id: sourceId,
    colid: Number(payment.colid)
  });
  if (!onlinePayment || isSettledOnlineStatus(onlinePayment.paymentstatus)) return onlinePayment;

  onlinePayment.paymentstatus = "Failed";
  onlinePayment.paidamount = 0;
  onlinePayment.gatewayrefno = text(payment.refno || payment.txnid || payment.merchantTxnNo);
  onlinePayment.gatewayresponse = gatewayParams || {};
  await onlinePayment.save();
  return onlinePayment;
};

exports.getStudentOnlinePayments = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    await exports.reconcileSuccessfulStudentOnlinePayments({ colid, regno: req.query.regno });
    const data = await StudentOnlinePayment.find(reportQuery(req.query)).sort({ paiddate: -1, initiationdate: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getStudentOnlinePaymentOptions = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const baseQuery = { colid };
    if (text(req.query.regno)) baseQuery.regno = text(req.query.regno);
    const fields = ["academicyear", "programcode", "semester", "gateway", "paymentstatus", "regno", "student"];
    const options = {};
    await Promise.all(fields.map(async (field) => {
      options[field] = (await StudentOnlinePayment.distinct(field, baseQuery)).filter(Boolean).sort();
    }));
    options.feegroup = (await StudentOnlinePayment.distinct("ledgeritems.feegroup", baseQuery)).filter(Boolean).sort();
    options.feeitem = (await StudentOnlinePayment.distinct("ledgeritems.feeitem", baseQuery)).filter(Boolean).sort();
    res.json({ success: true, data: options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
