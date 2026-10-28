const pending = new WeakMap();
module.exports = async function ensureAddressIndex(collection) {
  if (!pending.has(collection)) {
    const task = (async () => {
      await collection.createIndex({ colid: 1, programcode: 1, counselloremail: 1, location: 1, country: 1, state: 1, city: 1 }, { unique: true, background: true });
      try { await collection.dropIndex('colid_1_programcode_1_counselloremail_1_location_1'); }
      catch (error) { if (![26,27].includes(error.code)) throw error; }
    })().catch(error => { pending.delete(collection); throw error; });
    pending.set(collection, task);
  }
  return pending.get(collection);
};
