const draft = po => (!po.postatus || String(po.postatus).toLowerCase() === 'draft') && !['approved','submitted'].includes(String(po.approvalStatus || '').toLowerCase()) && !po.submittedtime && !po.approvedtime;
const financialFields = ['vendor','vendorid','vendoraddress','vendorcontact','vendorgst','storeid','storename','store','deliverylocation','deliveryaddress','deliveryphone','deliveryemail','deliverycontactperson','deliveryinstructions','deliverydate','terms','warranty','remarks','description','poType','deliveryType','prnumber','poid','price','netprice','actualAmount','amount','total','grandtotal','subtotal','discount','discountamount','gst','gstamount','taxamount','taxableamount'];
const same = (a,b) => (a == null || a === '') && (b == null || b === '') || String(a ?? '') === String(b ?? '');
function guardHeader(existing, payload) {
  if (!draft(existing)) {
    if (financialFields.some(field => payload[field] !== undefined && !same(existing[field], payload[field]))) throw new Error('Submitted or approved PO is locked. Financial, vendor, delivery and item details cannot change');
    if (payload.postatus && String(payload.postatus).toLowerCase() === 'draft') throw new Error('Submitted or approved PO cannot return to Draft');
  }
}
module.exports = { draft, guardHeader, financialFields };
