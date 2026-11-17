const Accountds = require('../Models/accountds');
const Mjournal2 = require('../Models/mjournal2');  // Added new model
const Mtrialbalance2 = require('../Models/mtrialbalance2');  // Added new model
const AccountGroup = require('../Models/accountgroupds');

// AccountGroup CRUD Controllers
exports.dscreateaccountgroup = async (req, res) => {
  try {
    const { name, groupname, user, colid, grouptype } = req.body;
    if (!name || !groupname || !user || !colid) {
      return res.status(400).json({
        success: false,
        message: 'name, groupname, user and colid are required'
      });
    }

    const newAccountGroup = new AccountGroup({
      name,
      groupname,
      user,
      colid,
      grouptype
    });

    await newAccountGroup.save();
    return res.status(201).json({
      success: true,
      data: newAccountGroup
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating account group',
      error: error.message
    });
  }
};

exports.dsgetaccountgroup = async (req, res) => {
  try {
    const { colid } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    const accountGroups = await AccountGroup.find({ colid: parseInt(colid) });
    return res.status(200).json({
      success: true,
      data: accountGroups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching account groups',
      error: error.message
    });
  }
};

exports.dsupdateaccountgroup = async (req, res) => {
  try {
    const { id, colid } = req.query;
    const updateData = req.body;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const updated = await AccountGroup.findOneAndUpdate(
      { _id: id, colid: parseInt(colid) },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Account group not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating account group',
      error: error.message
    });
  }
};

exports.dsdeleteaccountgroup = async (req, res) => {
  try {
    const { id, colid } = req.query;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const deleted = await AccountGroup.findOneAndDelete({
      _id: id,
      colid: parseInt(colid)
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Account group not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Account group deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting account group',
      error: error.message
    });
  }
};

// Accountds CRUD Controllers
exports.dscreateaccountds = async (req, res) => {
  try {
    const { name, user, colid, account, description, acctype, accountgroup } = req.body;
    if (!colid || !name || !user || !account) {
      return res.status(400).json({
        success: false,
        message: 'colid, name, user, and account are required'
      });
    }

    const newAccountds = new Accountds({
      name,
      user,
      colid,
      account,
      description,
      acctype,
      accountgroup
    });

    await newAccountds.save();
    return res.status(201).json({
      success: true,
      data: newAccountds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating accountds',
      error: error.message
    });
  }
};

exports.dsgetaccountds = async (req, res) => {
  try {
    const { colid, accountgroup } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    let filter = { colid: parseInt(colid) };
    if (accountgroup) {
      filter.accountgroup = accountgroup;
    }

    const accountds = await Accountds.find(filter);
    return res.status(200).json({
      success: true,
      data: accountds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching accountds',
      error: error.message
    });
  }
};

exports.dsupdateaccountds = async (req, res) => {
  try {
    const { id, colid } = req.query;
    const updateData = req.body;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const updated = await Accountds.findOneAndUpdate(
      { _id: id, colid: parseInt(colid) },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Accountds not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating accountds',
      error: error.message
    });
  }
};

exports.dsdeleteaccountds = async (req, res) => {
  try {
    const { id, colid } = req.query;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const deleted = await Accountds.findOneAndDelete({
      _id: id,
      colid: parseInt(colid)
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Accountds not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Accountds deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting accountds',
      error: error.message
    });
  }
};

// Mjournal2 CRUD Controllers (Updated for new model)
exports.dscreatemjournal2 = async (req, res) => {
  try {
    const {
      name,
      user,
      colid,
      year,
      accgroup,
      account,
      acctype,
      transaction,
      transactionref,
      subledger,
      cogs,
      activitydate,
      amount,
      credit,
      debit,
      type,
      student,
      regno,
      empid,
      status1,
      comments
    } = req.body;

    if (!colid || !name || !user) {
      return res.status(400).json({
        success: false,
        message: 'colid, name, and user are required'
      });
    }

    const center = typeof req.body.costcenter === "string" ? req.body.costcenter.trim() : "";
    const mapping = center && await require('../Models/financecostcenterds').findOne({colid,costcenter:center}).lean();
    if(center&&!mapping)return res.status(400).json({message:"Select a valid cost center"});
    const newMjournal2 = new Mjournal2({
      institution: mapping?.institution || "",
      costcenter: typeof req.body.costcenter === "string" ? req.body.costcenter.trim() : "",
      name,
      user,
      colid,
      year,
      accgroup,
      account,
      acctype,
      transaction,
      transactionref,
      subledger,
      cogs,
      activitydate,
      amount,
      credit,
      debit,
      type,
      student,
      regno,
      empid,
      status1,
      comments
    });

    await newMjournal2.save();
    return res.status(201).json({
      success: true,
      data: newMjournal2
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating mjournal2',
      error: error.message
    });
  }
};

exports.dsgetmjournal2 = async (req, res) => {
  try {
    const { colid, year, account, accgroup } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    let filter = { colid: parseInt(colid) };
    if (year) filter.year = year;
    if (account) filter.account = account;
    if (accgroup) filter.accgroup = accgroup;

    const mjournal2 = await Mjournal2.find(filter);
    return res.status(200).json({
      success: true,
      data: mjournal2
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching mjournal2',
      error: error.message
    });
  }
};

exports.dsupdatemjournal2 = async (req, res) => {
  try {
    const { id, colid } = req.query;
    const updateData = {...req.body};
    delete updateData.institution;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    if(typeof updateData.costcenter==="string"){
      updateData.costcenter=updateData.costcenter.trim();
      const center=updateData.costcenter&&await require('../Models/financecostcenterds').findOne({colid,costcenter:updateData.costcenter}).lean();
      if(updateData.costcenter&&!center)return res.status(400).json({message:"Select a valid cost center"});
      updateData.institution=center?.institution||"";
    }
    const updated = await Mjournal2.findOneAndUpdate(
      { _id: id, colid: parseInt(colid) },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Mjournal2 not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating mjournal2',
      error: error.message
    });
  }
};

exports.dsdeletemjournal2 = async (req, res) => {
  try {
    const { id, colid } = req.query;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const deleted = await Mjournal2.findOneAndDelete({
      _id: id,
      colid: parseInt(colid)
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Mjournal2 not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Mjournal2 deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting mjournal2',
      error: error.message
    });
  }
};

// Mtrialbalance2 CRUD Controllers
exports.dscreatemtrialbalance2 = async (req, res) => {
  try {
    const {
      name,
      user,
      colid,
      year,
      accgroup,
      account,
      acctype,
      cogs,
      amount,
      debit,
      credit,
      status1,
      comments
    } = req.body;

    if (!colid || !name || !user) {
      return res.status(400).json({
        success: false,
        message: 'colid, name, and user are required'
      });
    }

    const newMtrialbalance2 = new Mtrialbalance2({
      name,
      user,
      colid,
      year,
      accgroup,
      account,
      acctype,
      cogs,
      amount,
      debit,
      credit,
      status1,
      comments
    });

    await newMtrialbalance2.save();
    return res.status(201).json({
      success: true,
      data: newMtrialbalance2
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating mtrialbalance2',
      error: error.message
    });
  }
};

exports.dsgetmtrialbalance2 = async (req, res) => {
  try {
    const { colid, year, account, accgroup } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    let filter = { colid: parseInt(colid) };
    if (year) filter.year = year;
    if (account) filter.account = account;
    if (accgroup) filter.accgroup = accgroup;

    const mtrialbalance2 = await Mtrialbalance2.find(filter);
    return res.status(200).json({
      success: true,
      data: mtrialbalance2
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching mtrialbalance2',
      error: error.message
    });
  }
};

exports.dsupdatemtrialbalance2 = async (req, res) => {
  try {
    const { id, colid } = req.query;
    const updateData = req.body;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const updated = await Mtrialbalance2.findOneAndUpdate(
      { _id: id, colid: parseInt(colid) },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Mtrialbalance2 not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating mtrialbalance2',
      error: error.message
    });
  }
};

exports.dsdeletemtrialbalance2 = async (req, res) => {
  try {
    const { id, colid } = req.query;
    if (!id || !colid) {
      return res.status(400).json({
        success: false,
        message: 'id and colid are required'
      });
    }

    const deleted = await Mtrialbalance2.findOneAndDelete({
      _id: id,
      colid: parseInt(colid)
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Mtrialbalance2 not found for this colid'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Mtrialbalance2 deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting mtrialbalance2',
      error: error.message
    });
  }
};

// Report Generation Controller for Mjournal2
exports.dsmjournal2report = async (req, res) => {
  try {
    const { type, year, account, startDate, endDate, colid } = req.body;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    let filter = { colid: parseInt(colid) };
    
    // Type 1: Select year and account
    if (type === '1') {
      if (!year || !account) {
        return res.status(400).json({
          success: false,
          message: 'Year and account are required for type 1 report'
        });
      }
      filter.year = year;
      filter.account = account;
    }
    // Type 2: Select year
    else if (type === '2') {
      if (!year) {
        return res.status(400).json({
          success: false,
          message: 'Year is required for type 2 report'
        });
      }
      filter.year = year;
    }
    // Type 3: Date range and account
    else if (type === '3') {
      if (!startDate || !endDate || !account) {
        return res.status(400).json({
          success: false,
          message: 'Start date, end date, and account are required for type 3 report'
        });
      }
      filter.activitydate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
      filter.account = account;
    }
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type'
      });
    }

    const data = await Mjournal2.find(filter);
    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating report',
      error: error.message
    });
  }
};

// Helper endpoints
exports.dsgetaccountsbycolid = async (req, res) => {
  try {
    const { colid } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    const accounts = await Accountds.distinct('account', { colid: parseInt(colid) });
    return res.status(200).json({
      success: true,
      data: accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching accounts',
      error: error.message
    });
  }
};

exports.dsgetyearsbycolid = async (req, res) => {
  try {
    const { colid } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    const years = await Mjournal2.distinct('year', { colid: parseInt(colid) });
    return res.status(200).json({
      success: true,
      data: years.filter(year => year)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching years',
      error: error.message
    });
  }
};

exports.dsgetaccountsmeta = async (req, res) => {
  try {
    const { colid } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    const accounts = await Accountds.find(
      { colid: parseInt(colid) },
      { account: 1, acctype: 1, accountgroup: 1 }
    );

    return res.status(200).json({
      success: true,
      data: accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching account metadata',
      error: error.message
    });
  }
};

// Get accounts by colid and accountgroup with metadata
exports.dsgetaccountsbygroup = async (req, res) => {
  try {
    const { colid, accountgroup } = req.query;
    if (!colid || !accountgroup) {
      return res.status(400).json({
        success: false,
        message: 'colid and accountgroup are required'
      });
    }

    const accounts = await Accountds.find(
      { 
        colid: parseInt(colid),
        accountgroup: accountgroup 
      },
      { account: 1, acctype: 1, accountgroup: 1, description: 1 }
    );

    return res.status(200).json({
      success: true,
      data: accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching accounts by group',
      error: error.message
    });
  }
};

// Get account groups with their types
exports.dsgetaccountgroupswithtypes = async (req, res) => {
  try {
    const { colid } = req.query;
    if (!colid) {
      return res.status(400).json({
        success: false,
        message: 'colid is required'
      });
    }

    const accountGroups = await AccountGroup.find(
      { colid: parseInt(colid) },
      { groupname: 1, grouptype: 1 }
    );

    return res.status(200).json({
      success: true,
      data: accountGroups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching account groups with types',
      error: error.message
    });
  }
};
