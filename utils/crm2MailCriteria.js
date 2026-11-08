function matchesMailCriteria(subject, body, criteria = {}) {
  const contains = (content, value) => !!String(value || '').trim() && String(content || '').toLowerCase().includes(String(value).trim().toLowerCase());
  if (criteria.matchMode === 'subject') return contains(subject, criteria.subject);
  if (criteria.matchMode === 'body') return contains(body, criteria.body);
  if (criteria.matchMode === 'both') return contains(subject, criteria.subject) && contains(body, criteria.body);
  const checks = [
    [subject, criteria.subject],
    [body, criteria.body]
  ].filter(([, value]) => String(value || '').trim()).map(([content, value]) => String(content || '').toLowerCase().includes(String(value).trim().toLowerCase()));
  if (!checks.length) return false;
  return criteria.matchMode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}
function validateMailCriteria(criteria = {}) {
  if (criteria.matchMode && !['subject', 'body', 'both', 'all', 'any'].includes(criteria.matchMode)) throw new Error('Select a valid matching mode');
  const subject = String(criteria.subject || '').trim(), body = String(criteria.body || '').trim();
  if (['subject', 'both'].includes(criteria.matchMode) && !subject) throw new Error('Enter subject criteria');
  if (['body', 'both'].includes(criteria.matchMode) && !body) throw new Error('Enter body criteria');
  if (!subject && !body) throw new Error('Enter subject or body criteria');
}
function extractMailPhone(subject, body) {
  const content = [body, subject].map(value => String(value || '').replace(/[^\s<>]+@[^\s<>]+/g, '')).join('\n');
  const normalize = value => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 ? `${value.trim().startsWith('+') ? '+' : ''}${digits}` : '';
  };
  // Prefer explicitly labelled contacts; unlabelled numbers must have at least 10 digits.
  for (const match of content.matchAll(/(?:phone|mobile|contact|whatsapp|tel)(?:\s*(?:number|no\.?))?\s*[:=\-]?\s*(\+?\d[\d(). \t-]*\d)/gi)) {
    const phone = normalize(match[1]); if (phone) return phone;
  }
  for (const match of content.matchAll(/(?<![\w])\+?\d[\d(). \t-]*\d(?![\w])/g)) {
    const phone = normalize(match[0]); if (phone.replace(/\D/g, '').length >= 10) return phone;
  }
  return '';
}
module.exports = { matchesMailCriteria, validateMailCriteria, extractMailPhone };
