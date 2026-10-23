let pending;
module.exports = async function ensureYearIndex(collection) {
  if (!pending) pending = (async () => {
    await collection.createIndex({ colid: 1, leadid: 1, academicyear: 1, programcode: 1 }, { unique: true, background: true });
    try { await collection.dropIndex('colid_1_leadid_1_programcode_1'); }
    catch (error) { if (![26, 27].includes(error.code)) throw error; }
  })().catch(error => { pending = null; throw error; });
  return pending;
};
