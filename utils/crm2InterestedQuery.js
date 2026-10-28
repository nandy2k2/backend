const text = value => String(value ?? '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
function interestedQuery(colid, input) {
  const academicyear = text(input.academicyear);
  let codes, filters;
  try { codes = JSON.parse(input.programcodes || '[]'); filters = JSON.parse(input.filters || '[]'); } catch { throw new Error('Invalid program selection or filters'); }
  if (!academicyear || !Array.isArray(codes) || !codes.length || codes.length > 100 || codes.some(code => typeof code !== 'string' || !text(code))) throw new Error('Select academic year and one or more programs');
  if (!Array.isArray(filters) || filters.length > 30) throw new Error('Use up to 30 filters');
  const query = { colid, programsinterested: { $elemMatch: { academicyear, programcode: { $in: [...new Set(codes.map(text))] } } } };
  const and = [];
  for (const filter of filters) {
    if (!['pipeline','source','admitted'].includes(filter?.field)) throw new Error('Invalid lead search filter');
    if (!text(filter.value)) continue;
    if (filter.field === 'admitted') {
      if (!['Yes','No'].includes(filter.value)) throw new Error('Admitted must be Yes or No');
      and.push(filter.value === 'No' ? { $or: [{ admitted: 'No' }, { admitted: null }, { admitted: '' }] } : { admitted: 'Yes' });
    } else and.push({ [filter.field]: exact(filter.value) });
  }
  if (and.length) query.$and = and;
  return query;
}
module.exports = { interestedQuery };
