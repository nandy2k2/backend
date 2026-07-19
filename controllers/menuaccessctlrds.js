const menuaccessds = require('./../Models/menuaccessds');
const User = require('./../Models/user');

exports.getMenuAccessRules = async (req, res) => {
  try {
    const { colid } = req.query;
    const filter = {};

    if (colid) {
      filter.colid = Number(colid);
    }

    const data = await menuaccessds.find(filter).sort({ menugroup: 1, title: 1, role: 1 });
    res.json({ status: 'Success', data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.createMenuAccessRule = async (req, res) => {
  try {
    const { colid, menugroup, groupname, title, path, role, access, user } = req.body;

    if (!colid || !menugroup || !title || !path || !role || !access) {
      return res.status(400).json({ status: 'Failed', message: 'All fields are required' });
    }

    const data = await menuaccessds.create({
      colid: Number(colid),
      menugroup,
      groupname: groupname || menugroup,
      title,
      path,
      role,
      access,
      user,
      status1: 'Submitted',
      comments: 'NA'
    });

    res.status(201).json({ status: 'Success', data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.updateMenuAccessRule = async (req, res) => {
  try {
    const { id } = req.body;
    const { colid, menugroup, groupname, title, path, role, access, user } = req.body;

    const data = await menuaccessds.findByIdAndUpdate(
      id,
      {
        colid: Number(colid),
        menugroup,
        groupname: groupname || menugroup,
        title,
        path,
        role,
        access,
        user,
        status1: 'Submitted',
        comments: 'NA'
      },
      { new: true, runValidators: true }
    );

    if (!data) {
      return res.status(404).json({ status: 'Failed', message: 'Rule not found' });
    }

    res.json({ status: 'Success', data });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.deleteMenuAccessRule = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
    const { id } = req.body;

    if (ids.length) {
      const data = await menuaccessds.deleteMany({ _id: { $in: ids } });
      return res.json({ status: 'Success', deletedCount: data.deletedCount });
    }

    const data = await menuaccessds.findByIdAndDelete(id);

    if (!data) {
      return res.status(404).json({ status: 'Failed', message: 'Rule not found' });
    }

    res.json({ status: 'Success' });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};

exports.getMenuAccessRoleOptions = async (req, res) => {
  try {
    const { colid } = req.query;
    const filter = {};

    if (colid) {
      filter.colid = Number(colid);
    }

    const roles = await User.distinct('role', filter);
    res.json({ status: 'Success', data: roles.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ status: 'Failed', message: err.message });
  }
};
