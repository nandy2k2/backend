const text = value => String(value ?? '').trim();

function examFormPrintEligibility(rows = []) {
  const pending = rows.filter(row => !/^Yes$/i.test(text(row.fees)));
  const labels = [...new Set(pending.map(row => text(row.course) || text(row.coursecode)).filter(Boolean))];
  if (!rows.length) return {
    eligible: false,
    total: 0,
    cleared: 0,
    pending: 0,
    message: 'Printing is disabled because no Exam Roll entry is available for this exam.'
  };
  if (pending.length) return {
    eligible: false,
    total: rows.length,
    cleared: rows.length - pending.length,
    pending: pending.length,
    message: `Printing is disabled because Fees is not Yes in Exam Roll${labels.length ? ` for: ${labels.join(', ')}` : ''}.`
  };
  return { eligible: true, total: rows.length, cleared: rows.length, pending: 0, message: '' };
}

module.exports = { examFormPrintEligibility };
