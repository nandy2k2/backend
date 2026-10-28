const mongoose = require('mongoose');
const PO = require('../Models/storepoorderds2');
const Item = require('../Models/storepoitemsds2');
const PR = require('../Models/storeprrequestds2');
const Store = require('../Models/storemasterds2');
const Vendor = require('../Models/vendords2');
const Signature = require('../Models/usersignatureds');
const Workflow = require('../Models/storepoapprovalworkflowds2');
const { draft } = require('../utils/purchase2PoRules');
const { calculatePoLine, summarizePo } = require('../utils/purchase2Amounts');
const { canEdit, canApprove } = require('./purchase2PoAccess');
const prService = require('./purchase2PrPo');
const { key } = require('../utils/purchase2PrAvailability');
const text = value => String(value ?? '').trim();
async function delivery(colid, storeid, session) {
  if (!storeid) return {};
  const store = await Store.findOne({ colid, _id: storeid }).session(session).lean();
  if (!store) throw new Error('Select a receiving store from Store master');
  return { storeid: String(store._id), storename: store.storename || store.name, store: store.storename || store.name, deliverylocation: store.storename || store.name, deliveryaddress: store.address || store.location || '', deliveryphone: store.contactnumber || store.phone || '', deliveryemail: store.email || '', deliverycontactperson: store.contactperson || store.storemanager || '' };
}
async function save(actor, body) {
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      let header = body.id ? await PO.findOne({ _id: body.id, colid: actor.colid }).session(session).lean() : null;
      if (body.id && !header) throw new Error('PO not found');
      if (header) { canEdit(actor, header); if (!draft(header)) throw new Error('This PO has been submitted or approved and is locked'); }
      if (!header && body.header?.prnumber) throw new Error('Create a PR-linked PO through the PR allocation workflow');
      if (header?.prnumber) await PR.updateOne({ colid: actor.colid, prnumber: header.prnumber }, { $inc: { porevision: 1 } }, { session });
      if (header) {
        const locked = await PO.findOneAndUpdate({ _id: header._id, colid: actor.colid, postatus: header.postatus }, { $inc: { calculationrevision: 1 } }, { new: true, session }).lean();
        if (!locked || !draft(locked)) throw new Error('The PO status changed. Reload before editing');
        header = locked;
      }
      const vendor = await Vendor.findOne({ colid: actor.colid, _id: body.header?.vendorid || header?.vendorid }).session(session).lean();
      if (!vendor) throw new Error('Select a vendor');
      const storeid = body.header?.storeid || header?.storeid;
      if (!storeid) throw new Error('Select a receiving store');
      const store = await delivery(actor.colid, storeid, session);
      if (!Array.isArray(body.items) || !body.items.length) throw new Error('Add at least one PO item');
      const previous = header ? await Item.find({ colid: actor.colid, poid: header.poid }).session(session).lean() : [];
      if (header) await Item.deleteMany({ colid: actor.colid, poid: header.poid }, { session });
      const remaining = header?.prnumber ? await prService.read(actor.colid, header.prnumber, session) : null;
      const used = new Map(), poid = header?.poid || `PO-${Date.now()}-${new mongoose.Types.ObjectId().toString().slice(-6).toUpperCase()}`;
      const items = body.items.map(input => {
        const old = previous.find(row => String(row._id) === String(input._id));
        if (input._id && !old) throw new Error('An item does not belong to this PO');
        const line = calculatePoLine(input, true);
        let prline;
        if (remaining && input.prallocation !== false) {
          const candidates = remaining.lines.filter(row => input.pritemid ? row.pritemid === String(input.pritemid) : old && key(row) === key(input));
          if (candidates.length > 1) throw new Error('Legacy PR line is ambiguous. Remove it and re-add the correct item');
          prline = candidates[0];
          if (input.pritemid && !prline) throw new Error('Invalid PR line');
          if (prline) {
            const count = (used.get(prline.pritemid) || 0) + line.quantity; used.set(prline.pritemid, count);
            if (count > prline.remainingquantity + 1e-8) throw new Error(`${prline.itemname}: quantity exceeds the PR quantity remaining after other POs`);
          }
        }
        const payload = { ...line, colid: actor.colid, name: actor.name, user: actor.email, poid, vendorid: String(vendor._id), vendor: vendor.vendorname || vendor.name, postatus: 'Draft', prallocation: !!prline, pritemid: prline?.pritemid, prnumber: prline ? header.prnumber : undefined };
        if (prline) Object.assign(payload, { itemid: prline.itemid, itemcode: prline.itemcode, itemname: prline.itemname, unit: prline.unit });
        for (const field of ['_id','id','createdAt','updatedAt','calculationerror']) delete payload[field];
        if (old) payload._id = old._id;
        return payload;
      });
      const fields = { vendorid: String(vendor._id), vendor: vendor.vendorname || vendor.name, vendoraddress: vendor.address || vendor.vendoraddress || '', vendorcontact: vendor.phone || vendor.mobile || '', vendorgst: vendor.gst || vendor.gstin || '', ...store, ...summarizePo(items, true) };
      for (const field of ['terms','warranty','remarks','deliveryinstructions','deliverydate','deliveryType']) if (body.header?.[field] !== undefined) fields[field] = body.header[field];
      let saved;
      if (header) saved = await PO.findOneAndUpdate({ _id: header._id, colid: actor.colid }, { $set: fields }, { new: true, session });
      else {
        const signature = await Signature.findOne({ colid: actor.colid, useremail: actor.email }).session(session).lean();
        [saved] = await PO.create([{ ...fields, colid: actor.colid, poid, name: actor.name, user: actor.email, creatorName: actor.name, creatorEmail: actor.email, creatorSignature: signature?.signaturelink || '', poType: 'Empty', postatus: 'Draft', approvalStatus: 'Draft' }], { session });
      }
      const savedItems = await Item.insertMany(items, { session });
      if (header?.prnumber) await prService.sync(actor.colid, header.prnumber, await prService.read(actor.colid, header.prnumber, session), session);
      result = { header: saved, items: savedItems };
    });
    return result;
  } finally { await session.endSession(); }
}
async function action(actor, body) {
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const header = await PO.findOneAndUpdate({ _id: body.id, colid: actor.colid }, { $inc: { calculationrevision: 1 } }, { new: true, session }).lean();
      if (!header) throw new Error('PO not found');
      const patch = {}, status = text(header.postatus).toLowerCase();
      if (body.action === 'submit') {
        canEdit(actor, header); if (!draft(header)) throw new Error('Only a draft PO can be submitted');
        const lines = await Item.find({ colid: actor.colid, poid: header.poid }).session(session).lean();
        if (!lines.length) throw new Error('Add PO items before submitting');
        const levels = await Workflow.find({ colid: actor.colid, status: /^Active$/i }).sort({ level: 1 }).session(session).lean();
        Object.assign(patch, summarizePo(lines, true), { postatus: 'Submitted', approvalStatus: 'Pending', currentStep: levels[0]?.level || 1, submittedtime: new Date().toISOString() });
      } else if (['approve','reject'].includes(body.action)) {
        if (status !== 'submitted') throw new Error('Only submitted POs may be approved or rejected');
        const { current, next } = await canApprove(actor, header);
        const signature = await Signature.findOne({ colid: actor.colid, useremail: actor.email }).session(session).lean();
        const history = [...(header.approvalhistory || []), { level: current.level, approvername: actor.name, approveremail: actor.email, signaturelink: signature?.signaturelink || '', date: new Date().toISOString(), status: body.action === 'reject' ? 'Rejected' : 'Approved' }];
        Object.assign(patch, { approvalhistory: history }, body.action === 'reject' ? { postatus: 'Rejected', approvalStatus: 'Rejected' } : next ? { currentStep: next.level, postatus: 'Submitted', approvalStatus: 'Pending' } : { postatus: 'Approved', approvalStatus: 'Approved', approvedtime: new Date().toISOString() });
      } else throw new Error('Invalid PO action');
      result = await PO.findOneAndUpdate({ _id: header._id, colid: actor.colid }, { $set: patch }, { new: true, session });
      if (header.prnumber && body.action === 'reject') await prService.sync(actor.colid, header.prnumber, await prService.read(actor.colid, header.prnumber, session), session);
    }); return result;
  } finally { await session.endSession(); }
}
module.exports = { save, action, delivery };
