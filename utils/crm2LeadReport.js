const { Lead, excluded } = require('../Models/crm2ds');
const text = value => String(value ?? '').trim();
const hidden = new Set([...excluded, 'password','emailkey','phonekey','colid','user','crm2profileversion','__v']);
const safe = field => !hidden.has(field.split('.')[0]) && !field.split('.').some(part => /^_|password|secret|token/i.test(part));
const title = field => ({ academicyear: 'Academic year', crmcategory: 'CRM category', admitted: 'Admitted', programcode: 'Program code', stagetime: 'Stage time', dateadded: 'Date added', counsellorname: 'Counselor name', counselloremail: 'Counselor email' }[field] || field.replace(/\./g, ' / ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, value => value.toUpperCase()));
const fields = [];
function inspect(schema, prefix = '') {
  schema.eachPath((name, path) => {
    const field = `${prefix}${name}`;
    if (!safe(field)) return;
    if (path.schema) return inspect(path.schema, `${field}.`);
    const type = path.instance === 'Array' ? path.caster?.instance : path.instance;
    if (['String','Number','Date','Boolean'].includes(type)) fields.push({ field, label: title(field), type, options: path.enumValues || path.caster?.enumValues || [] });
  });
}
// Program fields are deliberate report aliases for the Programs Interested array.
inspect(Lead.schema);
fields.push({ field: 'program', label: 'Program', type: 'String' }, { field: 'programcode', label: 'Program code', type: 'String' });
const fieldByName = new Map(fields.map(field => [field.field, field]));
const pathOf = field => field === 'program' || field === 'programcode' ? `programsinterested.${field}` : field;
const escape = value => Array.from(text(value), char => '\\^$.*+?()[]{}|'.includes(char) ? `\\${char}` : char).join('');
function parse(value, fallback = []) {
  if (value == null || value === '') return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) throw new Error('Enter a valid date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new Error('Enter a valid date');
  return date;
}
function queryFor(colid, source = {}) {
  const filters = parse(source.filters), codes = parse(source.programcodes);
  if (!Array.isArray(filters) || filters.length > 50 || !Array.isArray(codes) || codes.length > 300) throw new Error('Invalid report filters');
  const clauses = [], academicConditions = [];
  if (codes.length) clauses.push({ programsinterested: { $elemMatch: { programcode: { $in: codes.map(text).filter(Boolean) } } } });
  for (const filter of filters) {
    const definition = fieldByName.get(filter.field);
    if (!definition) throw new Error('Invalid report filter field');
    const values = Array.isArray(filter.values) ? filter.values : [filter.value];
    const entered = values.filter(value => value != null && text(value) !== '');
    if (!entered.length) continue;
    const op = filter.operator || 'in', path = pathOf(filter.field);
    if (!['in','contains','gte','lte'].includes(op)) throw new Error('Invalid filter operator');
    if (definition.type === 'String') {
      if (!['in','contains'].includes(op)) throw new Error('Use matches or contains for text fields');
      const condition = { $in: entered.map(value => new RegExp(op === 'in' ? `^${escape(value)}$` : escape(value), 'i')) };
      if (filter.field === 'academicyear') academicConditions.push(condition);
      else clauses.push({ [path]: condition });
    } else if (definition.type === 'Number') {
      const numbers = entered.map(Number);
      if (numbers.some(value => !Number.isFinite(value))) throw new Error('Enter valid numeric filter values');
      if (op === 'contains') throw new Error('Contains is not valid for numbers');
      clauses.push({ [path]: op === 'in' ? { $in: numbers } : { [op === 'gte' ? '$gte' : '$lte']: numbers[0] } });
    } else if (definition.type === 'Date') {
      if (op === 'contains') throw new Error('Contains is not valid for dates');
      const dates = entered.map(day);
      const range = date => ({ $gte: date, $lt: new Date(date.getTime() + 86400000) });
      clauses.push(op === 'in' ? { $or: dates.map(date => ({ [path]: range(date) })) } : { [path]: op === 'gte' ? { $gte: dates[0] } : { $lt: new Date(dates[0].getTime() + 86400000) } });
    } else {
      if (op !== 'in') throw new Error('Use matches for boolean fields');
      const booleans = entered.map(value => { if (!['true','false','yes','no','1','0'].includes(text(value).toLowerCase())) throw new Error('Choose Yes or No'); return ['true','yes','1'].includes(text(value).toLowerCase()); });
      clauses.push({ [path]: { $in: booleans } });
    }
  }
  if (source.dateFrom || source.dateTo) {
    const field = source.dateField || 'dateadded';
    if (fieldByName.get(field)?.type !== 'Date') throw new Error('Invalid date range field');
    const range = {};
    if (source.dateFrom) range.$gte = day(source.dateFrom);
    if (source.dateTo) range.$lt = new Date(day(source.dateTo).getTime() + 86400000);
    if (range.$gte && range.$lt && range.$gte >= range.$lt) throw new Error('From date must not be after to date');
    clauses.push(field === 'dateadded' ? { $or: [{ dateadded: range }, { dateadded: null, createdAt: range }] } : { [field]: range });
  }
  const scoped = [], programClauses = [], prefix = 'programsinterested.';
  const isProgramClause = clause => Object.keys(clause).every(key => key.startsWith(prefix));
  const strip = clause => Object.fromEntries(Object.entries(clause).map(([key,value]) => [key.slice(prefix.length), value]));
  for (const clause of clauses) {
    if (clause.programsinterested?.$elemMatch) programClauses.push(clause.programsinterested.$elemMatch);
    else if (isProgramClause(clause)) programClauses.push(strip(clause));
    else if (clause.$or?.every(isProgramClause)) programClauses.push({ $or: clause.$or.map(strip) });
    else scoped.push(clause);
  }
  const programMatch = programClauses.length ? [{ programsinterested: { $elemMatch: { $and: programClauses } } }] : [];
  if (academicConditions.length) scoped.push({ $or: [
    { $and: [...academicConditions.map(condition => ({ academicyear: condition })), ...programMatch] },
    { $and: [{ academicyear: { $in: ['', null] } }, { programsinterested: { $elemMatch: { $and: [...programClauses, ...academicConditions.map(condition => ({ academicyear: condition }))] } } }] }
  ] });
  else scoped.push(...programMatch);
  return { colid, ...(scoped.length ? { $and: scoped } : {}) };
}
const projection = Object.fromEntries([...hidden].filter(field => field !== '_id' && field !== 'program' && field !== 'programcode').map(field => [field, 0]));
module.exports = { fields, fieldByName, pathOf, queryFor, projection, title, escape, parse };
