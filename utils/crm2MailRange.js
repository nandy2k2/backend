const day = 86400000;
function mailRange({ from, to } = {}) {
  const range = {};
  for (const [value, operator] of [[from, '$gte'], [to, '$lte']]) {
    if (!value) continue;
    const date = new Date(value);
    if (typeof value !== 'string' || !Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time');
    range[operator] = date;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new Error('From must not be after To');
  return range;
}
function mailboxSearch(range) {
  // IMAP searches by calendar day; widen the search, then check timestamps exactly.
  return { ...(range.$gte ? { since: new Date(+range.$gte - day) } : {}), ...(range.$lte ? { before: new Date(+range.$lte + 2 * day) } : {}) };
}
function inMailRange(date, range) {
  const time = date ? +new Date(date) : NaN;
  return (!range.$gte || time >= +range.$gte) && (!range.$lte || time <= +range.$lte);
}
function storedMailRange(range) {
  return { $or: [{ receivedat: range }, { receivedat: null, sentat: range }, { receivedat: null, sentat: null, createdAt: range }] };
}
module.exports = { mailRange, mailboxSearch, inMailRange, storedMailRange };
