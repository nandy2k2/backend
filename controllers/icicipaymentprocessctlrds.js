const IciciGateway = require("../Models/icicigatewayds");
const IciciPayment = require("../Models/icicipaymentds");
const AdmissionApplication = require("../Models/admissionapplicationdynamic");
const ICICIPaymentHandler = require("../utils/icicigatewayhandler");
const studentOnlinePaymentController = require("./studentonlinepaymentctlrds");

function text(value) {
  return String(value || "").trim();
}

function amount(value) {
  const parsed = Number(value || 0);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function validEmail(value) {
  const email = text(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "payment@example.com";
}

function validPhone(value) {
  const digits = text(value).replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : "9999999999";
}

function regex(value) {
  return { $regex: text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
}

function fallbackBackendCallbackUrl(req) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}/api/v2/icicipayment/callback`;
}

function callbackRedirectUrl(payment) {
  return text(payment?.frontendcallbackurl) || process.env.FRONTEND_URL || "/";
}

function queryFrom(source = {}) {
  const query = { colid: Number(source.colid) };
  ["type", "status", "regno", "refno"].forEach((field) => {
    if (text(source[field])) query[field] = text(source[field]);
  });
  ["student", "feeitem"].forEach((field) => {
    if (text(source[field])) query[field] = regex(source[field]);
  });
  return query;
}

function isProvisionalAdmissionPayment(source = {}) {
  const paymentFor = text(source.paymentfor).toLowerCase();
  const feeItem = text(source.feeitem).toLowerCase();
  return paymentFor.includes("provisional") || feeItem.includes("provisional");
}

function buildHandler(config) {
  return new ICICIPaymentHandler({
    merchantId: config.merchantid,
    aggregatorId: config.aggregatorid,
    secretKey: config.secretkey,
    env: config.environment,
    saleUrl: config.saleurl,
    commandUrl: config.commandurl,
    settlementUrl: config.settlementurl
  });
}

function normalizeStatus(params = {}) {
  const responseCode = text(params.responseCode || params.txnResponseCode || params.respCode || params.ResponseCode || params.code);
  const responseMessage = text(params.respDescription || params.responseMessage || params.message || params.txnMessage).toUpperCase();
  const txnStatus = text(params.txnStatus || params.status || params.txn_status || params.paymentStatus).toUpperCase();
  if (["SUCCESS", "SUCCESSFUL", "PAID"].includes(txnStatus) || responseMessage.includes("SUCCESS")) return "SUCCESS";
  if (["P", "PENDING", "INITIATED", "INPROCESS", "IN PROCESS"].includes(txnStatus) || ["PENDING"].includes(responseCode.toUpperCase())) return "PENDING";
  if (responseCode || txnStatus) return "FAILED";
  return "PENDING";
}

async function updateAdmissionPayment(payment, params = {}) {
  if (payment.type !== "Admission" || !payment.applicationid) return;
  const isSuccess = payment.status === "SUCCESS";
  const provisionalPayment = isProvisionalAdmissionPayment(payment);
  const updatePayload = provisionalPayment
    ? {
        provisionalpaymentstatus: payment.status,
        provisionalpaymentrefno: payment.refno,
        provisionalpaiddate: payment.paiddate,
        provisionalpaidamount: payment.paidamount,
        provisionalpaymentdetails: params,
        applicationstatus: isSuccess ? "Applied" : "Payment Failed"
      }
    : {
        paymentstatus: payment.status,
        paymentrefno: payment.refno,
        paiddate: payment.paiddate,
        paidamount: payment.paidamount,
        paymentdetails: params,
        applicationstatus: isSuccess ? "Applied" : "Payment Failed"
      };
  await AdmissionApplication.findOneAndUpdate(
    { _id: payment.applicationid, colid: payment.colid },
    updatePayload,
    { new: true }
  );
}

exports.initiateIciciPayment = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const paidAmount = amount(req.body.amount);
    const requestedType = text(req.body.type);
    const paymentType = requestedType === "Event" ? "Event" : requestedType === "Admission" ? "Admission" : "Student";
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    if (!text(req.body.student) || !text(req.body.regno) || !text(req.body.feeitem) || paidAmount <= 0) {
      return res.status(400).json({ success: false, message: "Student, regno, fee item and amount are required" });
    }

    const config = await IciciGateway.findOne({ colid, isactive: true }).sort({ updatedAt: -1 }).lean();
    if (!config) return res.status(404).json({ success: false, message: "Active ICICI configuration not found" });

    const handler = buildHandler(config);
    const refno = `ICI_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const merchantTxnNo = `ICI${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20);
    const email = validEmail(req.body.email);
    const phone = validPhone(req.body.phone);
    const backendCallbackUrl = fallbackBackendCallbackUrl(req);

    const payment = await IciciPayment.create({
      name: text(req.body.name),
      user: text(req.body.user),
      colid,
      student: text(req.body.student),
      regno: text(req.body.regno),
      feeitem: text(req.body.feeitem),
      amount: paidAmount,
      type: paymentType,
      paymentfor: text(req.body.paymentfor),
      applicationid: text(req.body.applicationid),
      source: text(req.body.source),
      sourceid: text(req.body.sourceid),
      studentonlinepaymentid: text(req.body.studentonlinepaymentid),
      refno,
      merchantTxnNo,
      txnid: merchantTxnNo,
      description: text(req.body.description),
      email,
      phone,
      status: "INITIATED",
      frontendcallbackurl: text(req.body.frontendcallbackurl || req.body.returnurl)
    });

    const result = await handler.initiateSale({
      merchantTxnNo,
      amount: paidAmount,
      returnURL: backendCallbackUrl,
      customerEmailID: email,
      customerMobileNo: phone,
      customerName: text(req.body.student),
      addlParam1: refno,
      addlParam2: text(req.body.regno)
    });

    const paymenturl = handler.getAuthRedirectUrl(result.response);
    payment.gatewayresponse = { initiateRequest: result.request, initiateResponse: result.response };
    await payment.save();

    if (paymentType === "Admission" && text(req.body.applicationid)) {
      const provisionalPayment = isProvisionalAdmissionPayment(req.body);
      const updatePayload = provisionalPayment
        ? {
            provisionalfeeamount: paidAmount,
            provisionalpaymentstatus: "INITIATED",
            provisionalpaymentrefno: refno,
            provisionalpaymentdetails: { initiation: result.response }
          }
        : {
            applicationfeeamount: paidAmount,
            paymentstatus: "INITIATED",
            paymentrefno: refno,
            paymentdetails: { initiation: result.response }
          };
      await AdmissionApplication.findOneAndUpdate({ _id: text(req.body.applicationid), colid }, updatePayload, { new: true });
    }

    res.json({
      success: true,
      data: {
        payment,
        refno,
        merchantTxnNo,
        paymenturl,
        response: result.response
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.handleIciciPaymentCallback = async (req, res) => {
  try {
    const params = { ...req.query, ...req.body };
    const merchantTxnNo = text(params.merchantTxnNo || params.merchantTxnNO || params.txnId || params.txnid);
    if (!merchantTxnNo) throw new Error("merchantTxnNo missing in ICICI callback");

    const payment = await IciciPayment.findOne({ merchantTxnNo });
    if (!payment) throw new Error("Payment record not found");

    const config = await IciciGateway.findOne({ colid: payment.colid }).sort({ isactive: -1, updatedAt: -1 }).lean();
    if (!config) throw new Error("ICICI configuration not found");

    const handler = buildHandler(config);
    if ((params.secureHash || params.securehash) && !handler.verifySecureHash(params)) {
      throw new Error("ICICI secure hash verification failed");
    }

    payment.status = normalizeStatus(params);
    payment.txnid = text(params.txnID || params.paymentID || params.txnid) || merchantTxnNo;
    payment.paiddate = payment.status === "SUCCESS" ? new Date() : payment.paiddate;
    payment.paidamount = payment.status === "SUCCESS" ? amount(params.amount || payment.amount) : 0;
    payment.gatewayresponse = { ...(payment.gatewayresponse || {}), callbackResponse: params };
    await payment.save();
    await updateAdmissionPayment(payment, params);
    if (payment.source === "StudentFeesOnline" || payment.studentonlinepaymentid) {
      if (payment.status === "SUCCESS") {
        await studentOnlinePaymentController.settleSuccessfulStudentOnlinePayment(payment, params);
      } else if (payment.status === "FAILED") {
        await studentOnlinePaymentController.markFailedStudentOnlinePayment(payment, params);
      }
    }

    const redirectBase = callbackRedirectUrl(payment);
    const joiner = redirectBase.includes("?") ? "&" : "?";
    res.redirect(`${redirectBase}${joiner}refno=${encodeURIComponent(payment.refno)}&status=${encodeURIComponent(payment.status)}`);
  } catch (error) {
    const fallback = process.env.FRONTEND_URL || "/";
    const joiner = fallback.includes("?") ? "&" : "?";
    res.redirect(`${fallback}${joiner}paymentError=${encodeURIComponent(error.message)}`);
  }
};

exports.getIciciPayments = async (req, res) => {
  try {
    const colid = Number(req.query.colid);
    if (!colid) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await IciciPayment.find(queryFrom(req.query)).sort({ initiationdate: -1 }).lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.markIciciPaymentsManualSuccess = async (req, res) => {
  try {
    const colid = Number(req.body.colid);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(text).filter(Boolean) : [];
    if (!colid || !ids.length) return res.status(400).json({ success: false, message: "colid and selected payments are required" });
    const payments = await IciciPayment.find({
      _id: { $in: ids },
      colid,
      status: { $in: ["INITIATED", "FAILED", "Initiated", "Failed"] }
    });
    if (!payments.length) return res.status(400).json({ success: false, message: "Only INITIATED and FAILED transactions can be manually marked as SUCCESS" });

    const updated = [];
    for (const payment of payments) {
      payment.status = "SUCCESS";
      payment.paiddate = new Date();
      payment.paidamount = amount(payment.amount);
      payment.gatewayresponse = {
        ...(payment.gatewayresponse || {}),
        manualSuccess: {
          user: text(req.body.user),
          name: text(req.body.name),
          date: new Date(),
          remarks: text(req.body.remarks) || "Manual success update from ICICI payment manual success page"
        }
      };
      await payment.save();
      if (payment.source === "StudentFeesOnline" || payment.studentonlinepaymentid) {
        await studentOnlinePaymentController.settleSuccessfulStudentOnlinePayment(payment, payment.gatewayresponse.manualSuccess);
      }
      await updateAdmissionPayment(payment, payment.gatewayresponse.manualSuccess);
      updated.push(payment.toObject());
    }
    res.json({ success: true, count: updated.length, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
