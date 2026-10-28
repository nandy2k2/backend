const { Lead } = require('../Models/crm2ds');
const dateFields = ['dateadded','createdAt','updatedAt','followupdate','campusvisitdate','joiningdate'];
const text = value => String(value ?? '').trim();
const escape = value => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) throw new Error('Enter a valid date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error('Enter a valid date');
  return date;
}
function dateConditions(input) {
  if (!input.dateFrom && !input.dateTo) return [];
  const field = input.dateField || 'dateadded';
  if (!dateFields.includes(field)) throw new Error('Invalid date range field');
  const range = {};
  if (input.dateFrom) range.$gte = day(input.dateFrom);
  if (input.dateTo) range.$lt = new Date(day(input.dateTo).getTime() + 86400000);
  if (range.$gte && range.$lt && range.$gte >= range.$lt) throw new Error('From date must not be after to date');
  return [field === 'dateadded' ? { $or: [{ dateadded: range }, { dateadded: null, createdAt: range }] } : { [field]: range }];
}
function applyFilters(query, input) {
  let filters;
  try { filters = typeof input.filters === 'string' ? JSON.parse(input.filters || '[]') : input.filters || []; } catch { throw new Error('Invalid filters'); }
  if (!Array.isArray(filters) || filters.length > 30) throw new Error('Use up to 30 filters');
  const clauses = [...(query.$and || []), ...dateConditions(input)];
  for (const filter of filters) {
    const field = text(filter.field), value = text(filter.value), schema = Lead.schema.path(field);
    if (!value) continue;
    if (!schema || /password|token|secret|emailkey|phonekey|^colid$|^_|\./i.test(field) || !['String','Number','Date','Boolean'].includes(schema.instance)) throw new Error('Invalid filter field');
    if (schema.instance === 'Number') { if (!Number.isFinite(Number(value))) throw new Error('Enter a numeric filter value'); clauses.push({ [field]: Number(value) }); }
    else if (schema.instance === 'Date') clauses.push({ [field]: { $gte: day(value), $lt: new Date(day(value).getTime() + 86400000) } });
    else if (schema.instance === 'Boolean') { if (!['true','false','yes','no','1','0'].includes(value.toLowerCase())) throw new Error('Select Yes or No'); clauses.push({ [field]: ['true','yes','1'].includes(value.toLowerCase()) }); }
    else clauses.push({ [field]: new RegExp(escape(value), 'i') });
  }
  if (clauses.length) query.$and = clauses;
  return query;
}
module.exports = { dateFields, dateConditions, applyFilters };
