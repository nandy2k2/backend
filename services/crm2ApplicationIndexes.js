const pending = new WeakMap();
module.exports = function ensureIndexes(Model) {
  if (!pending.has(Model)) pending.set(Model, (async () => {
    // Build replacement uniqueness constraints before removing the legacy institution-wide ones.
    for (const field of ['email', 'phone']) {
      await Model.collection.createIndex({ colid: 1, [field]: 1, academicyear: 1, programcode: 1, formid: 1 }, { unique: true, sparse: true });
      await Model.collection.createIndex({ colid: 1, [field]: 1, crmleadid: 1 }, { unique: true, partialFilterExpression: { crmleadid: null } });
    }
    const indexes = await Model.collection.indexes();
    for (const index of indexes) {
      const keys = Object.keys(index.key);
      if (index.unique && keys.length === 2 && index.key.colid === 1 && (index.key.email === 1 || index.key.phone === 1)) await Model.collection.dropIndex(index.name);
    }
  })().catch(error => { pending.delete(Model); throw error; }));
  return pending.get(Model);
};
