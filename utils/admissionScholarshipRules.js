const text = value => String(value ?? '').trim();
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const accepts = (rule,value) => !text(rule) || /^all$/i.test(text(rule)) || text(rule).toLowerCase() === text(value).toLowerCase();
function educationPercentage(lead) {
  const education=lead.education || [],record=education.find(row=>/^12(th)?$/i.test(text(row.level))) || education[0],subjects=record?.subjects || [];
  if(!subjects.length || subjects.some(row=>row.obtained==null || row.obtained==='' || !Number.isFinite(Number(row.obtained)) || Number(row.obtained)<0 || !(Number(row.total)>0) || Number(row.obtained)>Number(row.total)))return undefined;
  return money(subjects.reduce((sum,row)=>sum+Number(row.obtained),0)/subjects.reduce((sum,row)=>sum+Number(row.total),0)*100);
}
function scholarshipMatches(row,student,percentage) {
  return (!text(row.academicyear)||row.academicyear===student.academicyear) && (!text(row.semester)||row.semester===student.semester) && row.programcode===student.programcode && row.program===student.program && row.active==='Yes' && accepts(row.gender,student.gender) && accepts(row.category,student.category) && (row.merit!=='Yes'||(Number.isFinite(percentage)&&percentage>=Number(row.meritpercentage)));
}
module.exports={money,accepts,educationPercentage,scholarshipMatches};
