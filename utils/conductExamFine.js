const dayMs = 86400000;
function fineToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function calculateExamFine(rules, courseCount, today = fineToday()) {
  const current = Date.parse(String(today).slice(0, 10));
  const count = Math.max(0, Math.floor(Number(courseCount) || 0));
  const applied = [];
  for (const rule of rules || []) {
    const start = Date.parse(String(rule.startdate).slice(0, 10)), end = Date.parse(String(rule.enddate).slice(0, 10));
    if (!count || !Number.isFinite(start) || !Number.isFinite(end) || current < start || current > end) continue;
    const days = rule.finetype === 'per day' ? Math.floor((current - start) / dayMs) + 1 : 1;
    const courses = rule.coursetype === 'per course' ? count : 1;
    const amount = Math.max(0, Number(rule.amount) || 0);
    applied.push({ ruleid: String(rule._id || ''), startdate: rule.startdate, enddate: rule.enddate, finetype: rule.finetype, coursetype: rule.coursetype, rate: amount, days, courses, amount: Math.round(amount * days * courses * 100) / 100 });
  }
  return { total: Math.round(applied.reduce((sum, rule) => sum + rule.amount, 0) * 100) / 100, applied, date: today };
}
module.exports = { fineToday, calculateExamFine };
