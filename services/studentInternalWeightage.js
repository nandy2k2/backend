const Assessment = require('../Models/assessmentcomponentds');
const text = value => String(value ?? '').trim();
const baseFields = ['academicyear','regulation','programcode','coursecode','assessmentcomponent','assessmentgroup'];
async function addWeightage(colid, marks, reportComponents = null) {
  if (!marks.length) return [];
  const queries = marks.map(row => ({ ...Object.fromEntries(baseFields.filter(field => field !== 'assessmentgroup' || text(row[field])).map(field => [field, text(row[field])])), ...(text(row.componenttype) ? { componenttype: text(row.componenttype) } : {}), ...(text(row.assessmentgrouptype) ? { grouptype: text(row.assessmentgrouptype) } : {}) }));
  const components = reportComponents || await Assessment.find({ colid, scoretype: 'Internal', status: { $not: /^Inactive$/i }, $or: [...new Map(queries.map(query => [JSON.stringify(query), query])).values()] }).select('academicyear regulation programcode semester coursecode componenttype assessmentgroup grouptype assessmentcomponent weightage').lean();
  return marks.map(row => {
    const matches = components.filter(component => baseFields.every(field => text(component[field]) === text(row[field])) && (!text(row.componenttype) || text(component.componenttype) === text(row.componenttype)) && (!text(row.assessmentgrouptype) || text(component.grouptype) === text(row.assessmentgrouptype)) && (!text(component.semester) || text(component.semester) === text(row.semester)));
    const exact = matches.filter(component => text(component.semester) === text(row.semester));
    const chosen = exact.length ? exact : matches;
    const values = [...new Set(chosen.map(component => component.weightage == null || component.weightage === '' ? 1 : Number(component.weightage)).filter(value => Number.isFinite(value) && value >= 0 && value <= 1))];
    const maxima = [...new Set(chosen.map(component => Number(component.marks)).filter(Number.isFinite))];
    const { passstatus, ...visible } = row;
    return { ...visible, weightage: values.length === 1 ? values[0] : null, ...(reportComponents ? { rawmaxmarks: maxima.length === 1 ? maxima[0] : null } : {}) };
  });
}
module.exports = { addWeightage };
