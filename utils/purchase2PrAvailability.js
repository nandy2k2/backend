const text = value => String(value ?? '').trim();
const key = row => row.itemid ? `id:${row.itemid}` : row.itemcode ? `code:${text(row.itemcode).toLowerCase()}` : `name:${text(row.itemname || row.item).toLowerCase()}`;
const cancelled = row => [row.postatus, row.approvalStatus].some(status => ['rejected','cancelled','canceled'].includes(text(status).toLowerCase()));
function availability(prItems, poItems, headers) {
  const active = new Set(headers.filter(row => !cancelled(row)).map(row => text(row.poid)));
  const explicit = new Map(), legacy = new Map();
  for (const row of poItems) {
    if (row.prallocation === false) continue;
    if (!active.has(text(row.poid))) continue;
    const quantity = Math.max(0, Number(row.quantity) || 0), id = text(row.pritemid);
    const map = id ? explicit : legacy, identity = id || key(row);
    map.set(identity, (map.get(identity) || 0) + quantity);
  }
  const lines = prItems.map(row => {
    const requested = Math.max(0, Number(row.quantity) || 0), id = text(row._id), identity = key(row);
    let ordered = explicit.get(id) || 0;
    const consumed = Math.min(Math.max(0, requested - ordered), legacy.get(identity) || 0);
    ordered += consumed; legacy.set(identity, Math.max(0, (legacy.get(identity) || 0) - consumed));
    const allocated = (row.isallocated === true || ['allocated','po generated','completed'].includes(text(row.allocationstatus).toLowerCase())) && (!row.poid || active.has(text(row.poid)));
    if (allocated) ordered = Math.max(ordered, requested);
    return { ...row, pritemid: id, requestedquantity: requested, orderedquantity: ordered, remainingquantity: Math.max(0, requested - ordered), allocated };
  });
  const complete = lines.length > 0 && lines.every(row => row.allocated || row.remainingquantity <= 1e-8);
  return { complete, lines, remaining: lines.filter(row => row.remainingquantity > 1e-8), ordered: lines.reduce((sum, row) => sum + row.orderedquantity, 0) };
}
module.exports = { availability, key, cancelled };
