const Policy = require('../Models/latefeepolicyds');
const Ledger = require('../Models/latefeesledgerds');
const { fineToday, calculateExamFine } = require('../utils/conductExamFine');
const text = value => String(value ?? '').trim();
const money = value => Math.round(Number(value || 0) * 100) / 100;
async function quote(colid, ledgerRows, student, today = fineToday()) {
  const due = ledgerRows.filter(row => row.duedate && fineToday(row.duedate) <= today && Number(row.balance) > 0);
  const groups = new Map();
  for (const row of due) {
    const scope = { academicyear: text(row.academicyear || student.academicyear), program: text(row.program || student.program), programcode: text(row.programcode || student.programcode) };
    if (!scope.academicyear || !scope.programcode || !scope.program) continue;
    const key = JSON.stringify(scope);
    if (!groups.has(key)) groups.set(key, { scope, rows: [] });
    groups.get(key).rows.push(row);
  }
  const applied = [];
  for (const group of groups.values()) {
    const rules = await Policy.find({ colid, ...group.scope }).lean();
    const calculated = calculateExamFine(rules, 1, today);
    for (const rule of calculated.applied) applied.push({ ...rule, ...group.scope, ledgerids: group.rows.map(row => String(row._id)) });
  }
  return { date: today, total: money(applied.reduce((sum, row) => sum + row.amount, 0)), applied };
}
async function recordPaid(online, payment, paiddate) {
  if (online.paymentsource !== 'OnlineFees3') return;
  if (money(payment.paidamount || payment.amount) < money(online.totalamount)) throw new Error('The received payment is less than the fees and late fine payable');
  if (!Number(online.latefineamount)) return;
  for (const rule of online.latefinerules || []) {
    await Ledger.updateOne({ colid: online.colid, studentonlinepaymentid: String(online._id), policyid: rule.ruleid }, { $setOnInsert: {
      student: online.student, regno: online.regno, email: online.studentemail,
      academicyear: rule.academicyear, regulation: online.regulation, program: rule.program, programcode: rule.programcode, semester: online.semester,
      startdate: rule.startdate, enddate: rule.enddate, finetype: rule.finetype, rate: rule.rate, days: rule.days,
      amount: rule.amount, paid: rule.amount, balance: 0, refno: online.refno,
      gatewayrefno: text(payment.refno || payment.txnid || payment.merchantTxnNo), gateway: online.gateway, paiddate,
      ledgerids: rule.ledgerids, status: 'Paid'
    } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true }).catch(error => {
      // A concurrent callback may already have inserted this same payment/policy.
      if (error.code !== 11000) throw error;
    });
  }
}
module.exports = { quote, recordPaid };
