const menuaccessds = require('./../Models/menuaccessds');
const User = require('./../Models/user');
const optionalOrder = value => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Order must be a valid number');
  return parsed;
};

exports.getMenuAccessRules = async (req, res) => {
  try {
    const { colid } = req.query;
    const filter = {};

    if (colid) {
      filter.colid = Number(colid);
    }

    let access;
    if(req.query.effective==='1'){
      access=await require('../services/additionalAccess').grantsForRequest(req);
      if(!access||access.colid!==Number(colid))return res.status(401).json({message:'Sign in to load effective access'});
      if(!/^(all|admin)$/i.test(access.actor.role)){
        const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        filter.role={$in:[new RegExp('^'+escape(access.actor.role)+'$','i'),/^all$/i]};
      }
    }
    let data = await menuaccessds.find(filter).select('colid role menugroup groupname title path access order').sort({ menugroup: 1, title: 1, role: 1 }).lean();
    if(access){
      const pages=access.rows.flatMap(row=>row.pages.map(page=>({colid:access.colid,role:access.actor.role,menugroup:row.group,title:page.title,path:page.path,access:'Allow'})));
      const paths=new Set(pages.map(page=>page.path));
      data=data.filter(row=>!(paths.has(row.path)&&[String(access.actor.role).toLowerCase(),'all'].includes(String(row.role).toLowerCase())));
      data.push(...pages);
    }
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
      order: optionalOrder(req.body.order),
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

    const order = optionalOrder(req.body.order);
    const orderUpdate = req.body.order === undefined ? {} : order === undefined ? { $unset: { order: 1 } } : { order };
    const data = await menuaccessds.findByIdAndUpdate(
      id,
      {
        ...orderUpdate,
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
