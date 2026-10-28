const text = value => String(value ?? '').trim();
const exact = value => new RegExp(`^${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
async function findAutoCounselor({ Mapping, User }, colid, lead) {
  if (!['country','state','city'].every(field => text(lead[field]))) return null;
  const programs = (lead.programsinterested || []).map((row, index) => ({ ...row, rank: Number(row.priority) || index + 1, index })).sort((a, b) => a.rank - b.rank || a.index - b.index);
  for (const program of programs) {
    const mappings = await Mapping.find({ colid, programcode: program.programcode, country: exact(lead.country), state: exact(lead.state), city: exact(lead.city) }).sort({ createdAt: 1, _id: 1 }).lean();
    for (const mapping of mappings) {
      if (!text(mapping.counselloremail)) continue;
      const person = await User.findOne({ colid, email: exact(mapping.counselloremail), role: { $not: /^Student$/i } }).select('name email').lean();
      if (person) return { counsellorname: person.name, counselloremail: text(person.email).toLowerCase() };
    }
  }
  return null;
}
module.exports = { findAutoCounselor };
