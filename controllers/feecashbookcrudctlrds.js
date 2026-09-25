const FeeBook = require("../Models/feebook");
const CashBook = require("../Models/cashbook");

function text(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function modelConfig(kind) {
  if (kind === "cash") {
    return {
      Model: CashBook,
      label: "Cash Book",
      sort: { cashnook: 1, cashbook: 1 },
      clean: (source = {}) => {
        const cashbook = text(source.cashbook || source.cashnook || source["Cash Book"]);
        return {
          cashbook,
          cashnook: cashbook,
          description: text(source.description || source.Description),
          type: text(source.type || source.Type),
          level: text(source.level || source.Level),
          status1: text(source.status1 || source.status || source.Status) || "Active",
          comments: text(source.comments || source.Comments)
        };
      },
      validate: (payload) => !payload.cashbook && "Cash Book is required"
    };
  }

  return {
    Model: FeeBook,
    label: "Fee Book",
    sort: { feebook: 1 },
    clean: (source = {}) => ({
      feebook: text(source.feebook || source["Fee Book"]),
      description: text(source.description || source.Description),
      type: text(source.type || source.Type),
      level: text(source.level || source.Level),
      status1: text(source.status1 || source.status || source.Status) || "Active",
      comments: text(source.comments || source.Comments)
    }),
    validate: (payload) => !payload.feebook && "Fee Book is required"
  };
}

function scopedQuery(source = {}) {
  const colid = numberValue(source.colid);
  const query = {};
  if (colid !== undefined) query.colid = colid;
  ["type", "level", "status1"].forEach((field) => {
    if (source[field]) query[field] = text(source[field]);
  });
  if (source.status) query.status1 = text(source.status);
  return query;
}

function makeController(kind) {
  const config = modelConfig(kind);

  return {
    list: async (req, res) => {
      try {
        const query = scopedQuery(req.query);
        if (query.colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
        const data = await config.Model.find(query).sort(config.sort).lean();
        res.json({ success: true, data });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    },

    save: async (req, res) => {
      try {
        const colid = numberValue(req.body.colid);
        if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
        const payload = {
          ...config.clean(req.body),
          colid,
          user: text(req.body.user),
          name: text(req.body.name)
        };
        if (!payload.user) return res.status(400).json({ success: false, message: "User is required" });
        if (!payload.name) return res.status(400).json({ success: false, message: "Name is required" });
        const validation = config.validate(payload);
        if (validation) return res.status(400).json({ success: false, message: validation });

        const data = req.body.id
          ? await config.Model.findOneAndUpdate({ _id: req.body.id, colid }, payload, { new: true, runValidators: true })
          : await config.Model.create(payload);

        if (!data) return res.status(404).json({ success: false, message: `${config.label} not found` });
        res.json({ success: true, data });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    },

    delete: async (req, res) => {
      try {
        const colid = numberValue(req.body.colid);
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [req.body.id].filter(Boolean);
        if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
        if (!ids.length) return res.status(400).json({ success: false, message: "No records selected" });
        const result = await config.Model.deleteMany({ _id: { $in: ids }, colid });
        res.json({ success: true, deleted: result.deletedCount || 0 });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    },

    bulk: async (req, res) => {
      try {
        const colid = numberValue(req.body.colid);
        if (colid === undefined) return res.status(400).json({ success: false, message: "colid is required" });
        const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
        const errors = [];
        const docs = [];
        rows.forEach((row, index) => {
          const payload = {
            ...config.clean(row),
            colid,
            user: text(req.body.user || row.user),
            name: text(req.body.name || row.name)
          };
          const validation = config.validate(payload) || (!payload.user && "User is required") || (!payload.name && "Name is required");
          if (validation) errors.push({ rowNumber: row.rowNumber || index + 2, message: validation });
          else docs.push(payload);
        });
        const inserted = docs.length ? await config.Model.insertMany(docs, { ordered: false }) : [];
        res.json({ success: true, inserted: inserted.length, errors });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }
  };
}

exports.feeBooks = makeController("fee");
exports.cashBooks = makeController("cash");
