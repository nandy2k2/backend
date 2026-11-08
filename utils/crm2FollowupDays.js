const dayInIndia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

function followupRanges(now = new Date()) {
  const parts = Object.fromEntries(dayInIndia.formatToParts(now).map(({ type, value }) => [type, value]));
  const start = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  const day = 86400000;
  return {
    today: { $gte: new Date(start), $lt: new Date(start + day) },
    tomorrow: { $gte: new Date(start + day), $lt: new Date(start + 2 * day) }
  };
}

module.exports = { followupRanges };
