const AccountGroup = require("../Models/accountgroupds");
const Accountds = require("../Models/accountds");
const Mjournal2 = require("../Models/mjournal2");
const Ledgerstud = require("../Models/ledgerstud");
const ChequeFeesPayment = require("../Models/chequefeespaymentds");
const Institution = require("../Models/insdetails");
const CostCenter = require("../Models/financecostcenterds");
const AcademicInstitution = require("../Models/academicmasterinstitutionds");

const models = {
  costcenters: CostCenter,
  accountgroups: AccountGroup,
  accounts: Accountds,
  journals: Mjournal2
};

const requiredDefaults = {
  accountgroups: { groupname: "NA", grouptype: "Asset" },
  accounts: { account: "NA", acctype: "Asset", accountgroup: "NA" },
  journals: { year: "NA", accgroup: "NA", account: "NA", acctype: "Asset", type: "Debit", status1: "Active" }
};

const text = (value) => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const escapeRegex = (value) => text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dateValue = (value, fallback = undefined) => {
  if (!value) return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(date.getTime()) ? fallback : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

function modelConfig(kind) {
  const Model = models[kind];
  if (!Model) return null;
  const fields = Object.keys(Model.schema.paths).filter((field) => field !== "__v");
  const editableFields = fields.filter((field) => !["_id", "createdAt", "updatedAt"].includes(field));
  const numberFields = fields.filter((field) => Model.schema.paths[field]?.instance === "Number");
  const dateFields = fields.filter((field) => Model.schema.paths[field]?.instance === "Date");
  return { Model, fields, editableFields, numberFields, dateFields };
}

function normalizeRow(row = {}, editableFields = []) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    const cleanKey = text(key).replace(/\s+/g, "").toLowerCase();
    const matched = editableFields.find((field) => field.toLowerCase() === cleanKey);
    if (matched) normalized[matched] = value;
  });
  return { ...row, ...normalized };
}

function buildPayload(kind, row, current = {}) {
  const cfg = modelConfig(kind);
  const input = normalizeRow(row, cfg.editableFields);
  const payload = {};
  cfg.editableFields.forEach((field) => {
    if (field === "colid") return;
    if (input[field] === undefined) return;
    if (cfg.numberFields.includes(field)) payload[field] = number(input[field], 0);
    else if (cfg.dateFields.includes(field)) payload[field] = dateValue(input[field], undefined);
    else payload[field] = text(input[field]);
  });
  Object.entries(requiredDefaults[kind] || {}).forEach(([field, value]) => {
    if (!payload[field]) payload[field] = value;
  });
  payload.name = text(current.name || row.name) || "NA";
  payload.user = text(current.user || row.user) || "NA";
  if (kind === "journals") {
    const amount = number(payload.amount, Math.max(number(payload.debit), number(payload.credit)));
    payload.amount = amount;
    if (text(payload.type).toLowerCase() === "credit") {
      payload.credit = number(payload.credit, amount);
      payload.debit = 0;
      payload.type = "Credit";
    } else {
      payload.debit = number(payload.debit, amount);
      payload.credit = 0;
      payload.type = "Debit";
    }
    if (!payload.activitydate) payload.activitydate = new Date();
    if (!payload.transactionref) payload.transactionref = `JRN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  return payload;
}

function buildQuery(kind, colid, filters = []) {
  const cfg = modelConfig(kind);
  const query = { colid };
  filters.forEach((filter) => {
    const field = text(filter.field);
    const value = filter.value;
    if (!field || value === "" || value === null || value === undefined || !cfg.fields.includes(field)) return;
    if (field === "_id") query._id = text(value);
    else if (cfg.numberFields.includes(field)) query[field] = number(value, undefined);
    else if (cfg.dateFields.includes(field)) {
      const parsed = dateValue(value, null);
      if (parsed) {
        const start = new Date(parsed);
        start.setHours(0, 0, 0, 0);
        const end = new Date(parsed);
        end.setHours(23, 59, 59, 999);
        query[field] = { $gte: start, $lte: end };
      }
    } else query[field] = new RegExp(escapeRegex(value), "i");
  });
  return query;
}

async function getOptionsFor(kind, colid) {
  const cfg = modelConfig(kind);
  const values = {};
  await Promise.all(cfg.fields.filter((field) => !["_id"].includes(field)).map(async (field) => {
    values[field] = (await cfg.Model.distinct(field, { colid }))
      .filter((item) => item !== null && item !== undefined && item !== "")
      .map((item) => cfg.dateFields.includes(field) ? new Date(item).toISOString().slice(0, 10) : String(item))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }));
  return { fields: cfg.fields, editableFields: cfg.editableFields, numberFields: cfg.numberFields, dateFields: cfg.dateFields, values };
}

exports.options = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.query.colid, undefined);
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const options = await getOptionsFor(req.params.kind, colid);
    if(req.params.kind==="costcenters") {
      const names=await AcademicInstitution.distinct("institution",{colid});
      options.values.institution=[...new Set([...names,...options.values.institution])].sort();
    }
    if(req.params.kind==="journals") options.costcenters=await CostCenter.find({colid}).select("costcenter institution").sort({costcenter:1}).lean();
    res.json({ success: true, ...options });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.list = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.body.colid, undefined);
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const data = await cfg.Model.find(buildQuery(req.params.kind, colid, Array.isArray(req.body.filters) ? req.body.filters : []))
      .sort(req.params.kind === "journals" ? { activitydate: -1, _id: -1 } : { _id: -1 })
      .limit(10000)
      .lean();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const costReportFields = ["account","accgroup","acctype","type","transaction","transactionref","subledger","cogs","student","regno","empid","status1","comments","name","user","costcenter","institution"];
exports.costReport = async (req,res) => {
  try {
    const colid=Number(req.body.colid);
    if(!Number.isSafeInteger(colid)||colid<=0) return res.status(400).json({message:"Institution is required"});
    if(req.body.options) {
      const fields=["year","institution","costcenter",...costReportFields.slice(0,8)];
      const entries=await Promise.all(fields.map(async field=>[field,(await Mjournal2.distinct(field,{colid})).filter(Boolean).sort()]));
      const values=Object.fromEntries(entries);
      values.institution=[...new Set([...values.institution,...await CostCenter.distinct("institution",{colid})].filter(Boolean))].sort();
      const centers=await CostCenter.distinct("costcenter",{colid});
      const posted=await Mjournal2.distinct("costcenter",{colid});
      const allCenters=[...new Set([...centers,...posted].filter(Boolean))].sort();
      values.costcenter=allCenters;
      return res.json({values,centers:allCenters});
    }
    const {costcenter,year,from,to,profitLoss,balanceSheet}=req.body;
    if(typeof year!=="string"||!year.trim()||(!profitLoss&&!balanceSheet&&(typeof costcenter!=="string"||!costcenter.trim()))) return res.status(400).json({message:"Select the required cost center and year"});
    const query={colid,year:year.trim()};
    if(typeof costcenter==="string"&&costcenter.trim())query.costcenter=costcenter.trim();
    if(from||to){
      const valid=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&dateValue(value)?.toISOString().slice(0,10)===value;
      if((from&&!valid(from))||(to&&!valid(to))||(from&&to&&from>to))return res.status(400).json({message:"Enter a valid date range"});
      query.activitydate={};
      if(from)query.activitydate.$gte=new Date(from);
      if(to)query.activitydate.$lt=new Date(new Date(to).getTime()+86400000);
    }
    if(profitLoss)query.acctype=/^(income|revenue|expense|expenses|expenditure)$/i;
    const filters=Array.isArray(req.body.filters)?req.body.filters:[];
    query.$and=[];
    for(const f of filters){
      if(!costReportFields.includes(f?.field)||typeof f.value!=="string"||!f.value.trim())continue;
      const value=f.value.trim();
      if(f.field==="institution"){
        const centers=await CostCenter.distinct("costcenter",{colid,institution:value});
        query.$and.push({$or:[{institution:value},{institution:{$in:[null,""]},costcenter:{$in:centers}}]});
      }else query.$and.push({[f.field]:f.field==="costcenter"?value:new RegExp(escapeRegex(value),"i")});
    }
    if(!query.$and.length)delete query.$and;
    const data=await Mjournal2.find(query).sort({activitydate:1,_id:1}).lean();
    const missing=[...new Set(data.filter(row=>!row.institution&&row.costcenter).map(row=>row.costcenter))];
    if(missing.length){
      const mappings=new Map((await CostCenter.find({colid,costcenter:{$in:missing}}).lean()).map(row=>[row.costcenter,row.institution]));
      for(const row of data)if(!row.institution&&mappings.has(row.costcenter))row.institution=mappings.get(row.costcenter);
    }
    res.json({data});
  }catch(error){res.status(500).json({message:error.message});}
};

async function assignJournalInstitution(payload){
  if(payload.costcenter===undefined){delete payload.institution;return;}
  const center=payload.costcenter&&await CostCenter.findOne({colid:payload.colid,costcenter:payload.costcenter}).lean();
  if(payload.costcenter&&!center)throw Error("Select a valid cost center");
  payload.institution=center?.institution||"";
}

exports.save = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.body.colid, undefined);
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const payload = { ...buildPayload(req.params.kind, req.body, { user: req.body.currentuser, name: req.body.currentname }), colid };
    const id = req.body.id || req.body._id;
    if(req.params.kind==="journals") await assignJournalInstitution(payload);
    if(req.params.kind==="costcenters"&&id){
      const existing=await CostCenter.findOne({_id:id,colid}).lean();
      if(existing&&existing.costcenter!==payload.costcenter&&await Mjournal2.exists({colid,costcenter:existing.costcenter}))return res.status(409).json({message:"A cost center with journal entries cannot be renamed"});
    }
    const data = id
      ? await cfg.Model.findOneAndUpdate({ _id: id, colid }, payload, { new: true, runValidators: true })
      : await cfg.Model.create(payload);
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.body.colid, undefined);
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    const data = await cfg.Model.findOneAndDelete({ _id: req.body.id, colid });
    if (!data) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulkDelete = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.body.colid, undefined);
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    if (!ids.length) return res.status(400).json({ success: false, message: "No records selected" });
    const result = await cfg.Model.deleteMany({ _id: { $in: ids }, colid });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.bulk = async (req, res) => {
  try {
    const cfg = modelConfig(req.params.kind);
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!cfg) return res.status(404).json({ success: false, message: "Invalid finance master" });
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "No rows found" });
    const docs = rows.map((row) => ({ ...buildPayload(req.params.kind, row, { user: req.body.user, name: req.body.name }), colid }));
    if(req.params.kind==="journals"){
      const mappings=await CostCenter.find({colid,costcenter:{$in:[...new Set(docs.map(row=>row.costcenter).filter(Boolean))]}}).lean();
      const institutions=new Map(mappings.map(row=>[row.costcenter,row.institution]));
      for(const row of docs){
        if(row.costcenter&&!institutions.has(row.costcenter))throw Error("Select a valid cost center: "+row.costcenter);
        row.institution=institutions.get(row.costcenter)||"";
      }
    }
    const data = await cfg.Model.insertMany(docs, { ordered: false });
    res.json({ success: true, inserted: data.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.accountMeta = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const accounts = await Accountds.find({ colid }).sort({ account: 1 }).lean();
    const groups = await AccountGroup.find({ colid }).sort({ groupname: 1 }).lean();
    res.json({ success: true, accounts, groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.voucherOptions = async (req, res) => {
  try {
    const colid = number(req.query.colid, undefined);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    const cfg = modelConfig("journals");
    const filters = typeof req.query.filters === "string"
      ? JSON.parse(req.query.filters || "[]")
      : Array.isArray(req.query.filters) ? req.query.filters : [];
    const query = buildQuery("journals", colid, filters);
    const from = dateValue(req.query.fromdate, null);
    const to = dateValue(req.query.todate, null);
    if (from || to) {
      query.activitydate = {};
      if (from) {
        const start = new Date(from);
        start.setHours(0, 0, 0, 0);
        query.activitydate.$gte = start;
      }
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        query.activitydate.$lte = end;
      }
    }
    const refs = await Mjournal2.distinct("transactionref", { ...query, transactionref: { $nin: [null, ""] } });
    const values = {};
    await Promise.all(cfg.fields.filter((field) => !["_id"].includes(field)).map(async (field) => {
      values[field] = (await Mjournal2.distinct(field, { colid }))
        .filter((item) => item !== null && item !== undefined && item !== "")
        .map((item) => cfg.dateFields.includes(field) ? new Date(item).toISOString().slice(0, 10) : String(item))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }));
    res.json({
      success: true,
      fields: cfg.fields,
      numberFields: cfg.numberFields,
      dateFields: cfg.dateFields,
      values,
      transactionrefs: refs.map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.voucherLoad = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const transactionref = text(req.body.transactionref);
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!transactionref) return res.status(400).json({ success: false, message: "transactionref is required" });
    const [entries, institution] = await Promise.all([
      Mjournal2.find({ colid, transactionref }).sort({ type: 1, account: 1 }).lean(),
      Institution.findOne({ colid }).sort({ _id: -1 }).lean()
    ]);
    res.json({ success: true, data: entries, institution: institution || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function chequeTokenRegex(chequeNumber) {
  return new RegExp(`(^|\\s)${escapeRegex(chequeNumber)}(?=\\s|$)`, "i");
}

function journalFromAccount({ account, amount, type, source, row, cheque, user, name, colid, realizedDate }) {
  return {
    name: name || "NA",
    user: user || "NA",
    colid,
    year: row.year || cheque.academicyear || "NA",
    accgroup: account.accountgroup || "NA",
    account: account.account || "NA",
    acctype: account.acctype || "Asset",
    transaction: `Cheque reconciliation ${cheque.chequenumber || cheque.referenceNumber || ""}`.trim(),
    transactionref: row.transactionref || row.reference || row.refno || `CHQ-REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    subledger: cheque.student || cheque.regno || "",
    cogs: "No",
    activitydate: realizedDate,
    amount,
    debit: type === "Debit" ? amount : 0,
    credit: type === "Credit" ? amount : 0,
    type,
    student: cheque.student,
    regno: cheque.regno,
    status1: "Active",
    comments: `Auto journal from cheque reconciliation. ${row.description || row.comments || ""}`.trim()
  };
}

exports.reconcileCheques = async (req, res) => {
  try {
    const colid = number(req.body.colid, undefined);
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    const debitAccountId = req.body.debitAccountId;
    const creditAccountId = req.body.creditAccountId;
    const realizedDate = dateValue(req.body.realizedDate, new Date());
    if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
    if (!rows.length) return res.status(400).json({ success: false, message: "Upload journal rows first" });
    if (!debitAccountId || !creditAccountId) return res.status(400).json({ success: false, message: "Debit and credit accounts are required" });

    const [debitAccount, creditAccount] = await Promise.all([
      Accountds.findOne({ _id: debitAccountId, colid }).lean(),
      Accountds.findOne({ _id: creditAccountId, colid }).lean()
    ]);
    if (!debitAccount || !creditAccount) return res.status(400).json({ success: false, message: "Selected debit or credit account was not found" });

    const pendingCheques = await ChequeFeesPayment.find({ colid, status: /^pending$/i }).lean();
    const results = [];
    const journalDocs = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = normalizeRow(rows[index], ["description", "amount", "debit", "credit", "activitydate", "year", "transactionref", "comments"]);
      const description = text(row.description || row.transaction || row.comments || row.narration);
      const rowAmount = number(row.amount, number(row.debit, number(row.credit, 0)));
      const matched = pendingCheques.find((cheque) => {
        const chqNo = text(cheque.chequenumber || cheque.referenceNumber);
        const amount = number(cheque.chequeamount || cheque.amount);
        return chqNo && chequeTokenRegex(chqNo).test(description) && Math.abs(amount - rowAmount) < 0.01;
      });
      if (!matched) {
        results.push({ row: index + 2, status: "Not matched", description, amount: rowAmount });
        continue;
      }

      const ledger = await Ledgerstud.findOne({ _id: matched.ledgerid, colid });
      if (!ledger) {
        results.push({ row: index + 2, status: "Ledger not found", cheque: matched.chequenumber, amount: rowAmount });
        continue;
      }

      const paidAmount = Math.min(rowAmount, Math.max(0, number(ledger.balance, number(matched.previousbalance))));
      const newPaid = number(ledger.paid) + paidAmount;
      const newBalance = Math.max(0, number(ledger.balance) - paidAmount);
      const history = Array.isArray(ledger.approvalhistory) ? ledger.approvalhistory : [];
      history.push({
        action: "Cheque reconciled from journal upload",
        chequeid: String(matched._id),
        chequenumber: matched.chequenumber,
        amountreceived: paidAmount,
        date: new Date(),
        user: text(req.body.user),
        description
      });

      ledger.paid = newPaid;
      ledger.balance = newBalance;
      ledger.paiddate = realizedDate;
      ledger.paymode = "Cheque";
      ledger.paydetails = matched.paydetails || matched.chequenumber || matched.referenceNumber || ledger.paydetails;
      ledger.cheque = number(ledger.cheque) + paidAmount;
      ledger.status = newBalance <= 0 ? "paid" : ledger.status;
      ledger.approvalhistory = history;
      await ledger.save();

      await ChequeFeesPayment.updateOne(
        { _id: matched._id, colid },
        {
          $set: {
            status: "Paid",
            chequerealizeddate: realizedDate,
            realizedby: text(req.body.user),
            realizedbyname: text(req.body.name),
            newpaid: newPaid,
            newbalance: newBalance,
            remarks: [matched.remarks, "Reconciled from journal upload"].filter(Boolean).join(" | ")
          }
        }
      );

      journalDocs.push(journalFromAccount({ account: debitAccount, amount: paidAmount, type: "Debit", row, cheque: matched, user: req.body.user, name: req.body.name, colid, realizedDate }));
      journalDocs.push(journalFromAccount({ account: creditAccount, amount: paidAmount, type: "Credit", row, cheque: matched, user: req.body.user, name: req.body.name, colid, realizedDate }));
      results.push({
        row: index + 2,
        status: "Matched",
        cheque: matched.chequenumber || matched.referenceNumber,
        student: matched.student,
        regno: matched.regno,
        feegroup: matched.feegroup,
        feeitem: matched.feeitem,
        originaldate: matched.originaldate,
        amount: paidAmount,
        oldbalance: ledger.balance + paidAmount,
        newbalance: newBalance
      });
    }

    const journals = journalDocs.length ? await Mjournal2.insertMany(journalDocs, { ordered: false }) : [];
    res.json({
      success: true,
      matched: results.filter((item) => item.status === "Matched").length,
      unmatched: results.filter((item) => item.status !== "Matched").length,
      journals: journals.length,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
