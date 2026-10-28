const mongoose = require('mongoose');
const PR = require('../Models/storeprrequestds2');
const PRItem = require('../Models/storeprrequestitemsds2');
const PO = require('../Models/storepoorderds2');
const POItem = require('../Models/storepoitemsds2');
const Assignment = require('../Models/storepoassignmentds2');
const Vendor = require('../Models/vendords2');
const { availability, key } = require('../utils/purchase2PrAvailability');
const { calculatePoLine, summarizePo } = require('../utils/purchase2Amounts');
const text = value => String(value ?? '').trim();
async function read(colid, prnumber, session = null) {
  const headers = await PO.find({ colid, prnumber }).session(session).lean();
  const lines = await PRItem.find({ colid, prnumber }).session(session).lean();
  const items = await POItem.find({ colid, poid: { $in: headers.map(row => row.poid) } }).session(session).lean();
  return availability(lines, items, headers);
}
async function sync(colid, prnumber, state, session = null) {
  if (state.complete) {
    await PR.updateMany({ colid, prnumber }, { $set: { status: 'PO Generated', postatus: 'Completed' } }, { session });
    await Assignment.updateMany({ colid, prnumber }, { $set: { status: 'Completed' } }, { session });
  } else {
    if (state.ordered > 0) await PR.updateMany({ colid, prnumber }, { $set: { status: 'Partially PO Generated', postatus: 'Pending' } }, { session });
    else await PR.updateMany({ colid, prnumber, status: { $in: ['PO Generated','Completed','Partially PO Generated'] } }, { $set: { status: 'Approved', postatus: 'Pending' } }, { session });
    await Assignment.updateMany({ colid, prnumber, status: { $in: ['Completed','PO Created','PO Generated'] } }, { $set: { status: 'Assigned' } }, { session });
  }
}
async function refresh(colid, prnumber) {
  const state = await read(colid, prnumber); await sync(colid, prnumber, state); return state;
}
async function create(colid, body) {
  const prnumber = text(body.prnumber), user = text(body.user), session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // Every PR-based creation writes this same document before reading allocations.
      const pr = await PR.findOneAndUpdate({ colid, prnumber }, { $inc: { porevision: 1 } }, { new: true, session }).lean();
      if (!pr) throw new Error('PR not found in this institution');
      const assignment = await Assignment.findOne({ _id: body.assignmentid, colid, prnumber, assignedtoemail: new RegExp(`^${user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).session(session).lean();
      if (!assignment || ['hold','rejected','reject'].includes(text(assignment.status).toLowerCase())) throw new Error('Select an available PR assigned to you');
      if (['hold','rejected','reject'].includes(text(pr.status).toLowerCase())) throw new Error('Held or rejected PR cannot create a PO');
      const state = await read(colid, prnumber, session);
      if (state.complete) throw new Error('All PR items are already allocated. No further PO can be created');
      if (!Array.isArray(body.items) || !body.items.length) throw new Error('Select remaining PR items');
      const vendor = await Vendor.findOne({ colid, _id: body.header?.vendorid }).session(session).lean();
      if (!vendor) throw new Error('Select a vendor from this institution');
      const seen = new Set(), poid = `PO-${Date.now()}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`;
      const items = body.items.map(input => {
        const id = text(input.pritemid || input._id);
        const matches = state.lines.filter(row => id ? row.pritemid === id : key(row) === key(input));
        if (matches.length !== 1) throw new Error('Select an identifiable PR line; reload remaining items');
        const line = matches[0], quantity = Number(input.quantity);
        if (seen.has(line.pritemid)) throw new Error('A PR line may only occur once in a PO');
        seen.add(line.pritemid);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > line.remainingquantity + 1e-8) throw new Error(`${line.itemname || line.itemcode}: quantity exceeds remaining PR quantity (${line.remainingquantity})`);
        const calculated = calculatePoLine({ quantity, price: input.price ?? line.estimatedprice ?? 0, gst: input.gst ?? 0, tax: input.tax, discount: input.discount ?? 0, discounttype: input.discounttype || 'Amount', sgst: input.sgst, cgst: input.cgst, igst: input.igst }, true);
        return { ...calculated, colid, user, name: text(body.name) || user, poid, pritemid: line.pritemid, prallocation: true, prnumber, itemid: line.itemid, itemcode: line.itemcode, itemname: line.itemname, unit: line.unit, category: line.category, make: input.make || '', vendorid: String(vendor._id), vendor: vendor.vendorname || vendor.name, postatus: 'Draft', storereqid: text(body.assignmentid || pr._id) };
      });
      const headerData = { colid, user, name: text(body.name) || user, poid, prnumber, vendorid: String(vendor._id), vendor: vendor.vendorname || vendor.name, ...summarizePo(items, true), creatorEmail: user, creatorName: text(body.name), postatus: 'Draft', approvalStatus: 'Draft', poType: 'Standard' };
      const storeid = body.header?.storeid || pr.storeid;
      if (storeid) Object.assign(headerData, await require('./purchase2PoDraft').delivery(colid, storeid, session));
      for (const field of ['terms','warranty','creatorSignature','year','description','createdtime']) if (body.header?.[field] !== undefined) headerData[field] = body.header[field];
      const [header] = await PO.create([headerData], { session });
      const savedItems = await POItem.insertMany(items, { session });
      const next = await read(colid, prnumber, session); await sync(colid, prnumber, next, session);
      result = { header, items: savedItems, complete: next.complete };
    });
    return result;
  } finally { await session.endSession(); }
}
async function list(colid, prnumber) {
  const prs = await PR.find({ colid, ...(prnumber ? { prnumber } : {}) }).lean();
  const numbers = prs.map(row => row.prnumber);
  const [headers, lines] = await Promise.all([PO.find({ colid, prnumber: { $in: numbers } }).lean(), PRItem.find({ colid, prnumber: { $in: numbers } }).lean()]);
  const items = await POItem.find({ colid, poid: { $in: headers.map(row => row.poid) } }).lean();
  const results = [], prWrites = [], assignmentWrites = [];
  for (const pr of prs) {
    const poHeaders = headers.filter(row => row.prnumber === pr.prnumber), poids = new Set(poHeaders.map(row => row.poid));
    const state = availability(lines.filter(row => row.prnumber === pr.prnumber), items.filter(row => poids.has(row.poid)), poHeaders);
    results.push({ prnumber: pr.prnumber, allowed: !['hold','rejected','reject'].includes(text(pr.status).toLowerCase()), ...state });
    if (state.complete) {
      prWrites.push({ updateMany: { filter: { colid, prnumber: pr.prnumber, status: { $ne: 'PO Generated' } }, update: { $set: { status: 'PO Generated', postatus: 'Completed' } } } });
      assignmentWrites.push({ updateMany: { filter: { colid, prnumber: pr.prnumber, status: { $ne: 'Completed' } }, update: { $set: { status: 'Completed' } } } });
    } else if (state.ordered > 0 || ['PO Generated','Completed','Partially PO Generated'].includes(pr.status)) {
      prWrites.push({ updateMany: { filter: { colid, prnumber: pr.prnumber }, update: { $set: { status: state.ordered > 0 ? 'Partially PO Generated' : 'Approved', postatus: 'Pending' } } } });
      assignmentWrites.push({ updateMany: { filter: { colid, prnumber: pr.prnumber, status: { $in: ['Completed','PO Created','PO Generated'] } }, update: { $set: { status: 'Assigned' } } } });
    }
  }
  if (prWrites.length) await PR.bulkWrite(prWrites);
  if (assignmentWrites.length) await Assignment.bulkWrite(assignmentWrites);
  return results;
}
module.exports = { read, sync, refresh, create, list };
