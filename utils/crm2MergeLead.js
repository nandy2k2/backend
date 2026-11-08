const { Lead, fields } = require('../Models/crm2ds');
const metadata = new Map(fields.map(field => [field.field, field]));
const hidden = /password|secret|token|authenticat|^_|^colid$|emailkey|phonekey|^crm2profileversion$|^scholarshipapplicationrevision$/i;
const locked = new Set(['name','email','phone','active','admitted','admissionstatus','status','lastlogin','user','addedby','dateadded','createdAt','updatedAt','createdby','updatedby','stage','stagetime','wizardcompleted','interactions','counsellorassignedat','telecallerassignedat']);
const labels = { leadgroup: 'Lead group', active: 'Active', addedby: 'Creation mode', dateadded: 'Date added', followupdate: 'Follow-up date', programsinterested: 'Programs interested', crmcategory: 'CRM category', admissionstatus: 'Admission status', counsellorname: 'Counsellor name', counselloremail: 'Counsellor email', telecallername: 'Telecaller name', telecalleremail: 'Telecaller email' };
const arraySearch = { programsinterested: ['academicyear','program','programcode'], education: ['level','institution','board','passingyear','grade','subjects.subject','subjects.grade'], documents: ['documentname','title','url'], interactions: ['details','interactiontype','reachable','rating','mode','contact','pipeline'], wizardcompleted: [''] };
const identityFields = ['name', 'email', 'phone'];
const fieldOrder = field => identityFields.includes(field) ? identityFields.indexOf(field) : identityFields.length;
const comparisonFields = Object.entries(Lead.schema.paths).filter(([field]) => !hidden.test(field)).sort(([a], [b]) => fieldOrder(a) - fieldOrder(b)).map(([field, schema]) => ({
  field, type: schema.instance, label: labels[field] || metadata.get(field)?.label || field.replace(/([a-z])([A-Z])/g, '$1 $2'),
  options: schema.enumValues || [], editable: !locked.has(field)
}));
const editable = new Set(comparisonFields.filter(field => field.editable).map(field => field.field));
const safeFields = new Map(comparisonFields.map(field => [field.field, field]));
const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
const maxLeads = 25;
const versionOf = lead => lead.updatedAt ? new Date(lead.updatedAt).toISOString() : null;
function filterQuery(scope, input) {
  const { applyFilters } = require('./crm2LeadFilters');
  let filters;
  try { filters = JSON.parse(input.filters || '[]'); } catch { throw Error('Invalid lead filters'); }
  if (!Array.isArray(filters) || filters.length > 30) throw Error('Use up to 30 filters');
  const scalar = [], extra = [];
  for (const filter of filters) {
    if (!filter?.value && filter?.value !== 0) continue;
    const field = safeFields.get(filter.field);
    if (!field) throw Error('Invalid filter field');
    const value = String(filter.value).trim().slice(0, 200);
    if (!value) continue;
    const paths = Object.hasOwn(arraySearch, field.field) && arraySearch[field.field];
    if (paths) {
      const match = new RegExp(escape(value), 'i');
      extra.push({ $or: paths.map(path => ({ [path ? `${field.field}.${path}` : field.field]: match })) });
    } else if (field.field === 'phone' && /^[+\d\s().-]+$/.test(value) && /\d/.test(value)) {
      extra.push({ $or: [{ phone: new RegExp(escape(value)) }, { phonekey: new RegExp(value.replace(/\D/g, '')) }] });
    } else scalar.push({ ...filter, value });
  }
  const query = applyFilters({ ...scope }, { ...input, filters: scalar });
  if (extra.length) query.$and = [...(query.$and || []), ...extra];
  return query;
}
function mergeChanges(rows, primaryId, choices, versions) {
  const byId = new Map(rows.map(lead => [String(lead._id), lead]));
  if (!byId.has(primaryId) || !choices || typeof choices !== 'object' || Array.isArray(choices)) throw Error('Select one primary lead and valid field sources');
  if (rows.some(lead => !Object.hasOwn(versions || {}, String(lead._id)) || versions[String(lead._id)] !== versionOf(lead))) throw Error('A selected lead changed. Refresh the comparison before merging.');
  const set = { active: 'Yes' }, unset = {};
  for (const [field, sourceId] of Object.entries(choices)) {
    if (!editable.has(field) || !byId.has(sourceId)) throw Error('Invalid field or source lead');
    if (sourceId === primaryId) continue;
    const value = byId.get(sourceId)[field];
    if (value === undefined) unset[field] = 1;
    else set[field] = value;
  }
  return { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) };
}
module.exports = { comparisonFields, safeFields, validId, maxLeads, filterQuery, mergeChanges, versionOf };
