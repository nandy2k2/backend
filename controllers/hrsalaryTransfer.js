const hrsalary = require('./../Models/hrsalary');
const hrsalstructure = require('./../Models/hrsalstructure');
const HrEmployeeAttendance = require('./../Models/hremployeeattendanceds');
const LeaveType = require('./../Models/hrleavetypeds');
const LeaveBalance = require('./../Models/hrleavebalanceds');
const AccrualRule = require('./../Models/hrleaveaccrualruleds');
const User = require('./../Models/user');

const text = (value) => String(value || '').trim();
const number = (value) => {
    const parsed = Number(value || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
};
const dateDays = (from, to) => {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.floor((end - start) / 86400000) + 1;
};

exports.generateSalary = async (req, res) => {
    try {
        const { colid, month, year } = req.body;
        const numericColid = Number(colid);

        // 1. Get only active structure records for colid
        const structures = await hrsalstructure.find({
            colid: numericColid,
            level: /^Active$/i
        });

        if (!structures.length) {
            return res.status(404).json({ message: "No active salary structures found" });
        }

        // 2. Prepare salary records
        const salaryDocs = structures.map(s => ({
            name: s.name,
            user: s.user,
            colid: numericColid,
            year,
            month,
            duedate: new Date(),
            structure: s.structure,
            structureid: s.structureid,
            employee: s.employee,
            empid: s.empid,
            component: s.component,
            amount: s.amount,
            type: s.type,
            level: "Active",
            paystatus: "pending",
            status1: s.status1,
            comments: s.comments
        }));

        // 3. Insert new salary rows without deleting any existing salary entries.
        const insertedSalary = await hrsalary.insertMany(salaryDocs);

        const summaryMap = insertedSalary.reduce((acc, item) => {
            const key = item.empid || item.employee || item._id.toString();
            if (!acc[key]) {
                acc[key] = {
                    id: key,
                    empid: item.empid,
                    employee: item.employee,
                    structure: item.structure,
                    earnings: 0,
                    deductions: 0,
                    total: 0,
                    components: 0
                };
            }

            const amount = Number(item.amount || 0);
            const isDeduction = String(item.type || '').toLowerCase() === 'deduction';
            if (isDeduction) {
                acc[key].deductions += amount;
            } else {
                acc[key].earnings += amount;
            }
            acc[key].total = acc[key].earnings - acc[key].deductions;
            acc[key].components += 1;
            return acc;
        }, {});

        const summary = Object.values(summaryMap).sort((a, b) =>
            String(a.employee || '').localeCompare(String(b.employee || ''))
        );

        res.json({
            message: "Salary generated successfully",
            count: insertedSalary.length,
            summary,
            details: insertedSalary
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.addEarnedLeave = async (req, res) => {
    try {
        const colid = Number(req.body.colid);
        const fromdate = text(req.body.fromdate);
        const todate = text(req.body.todate);
        const cyclename = text(req.body.cyclename || req.body.year);
        const user = text(req.body.user);
        const totaldays = dateDays(fromdate, todate);

        if (!colid) return res.status(400).json({ message: 'colid is required' });
        if (!totaldays) return res.status(400).json({ message: 'Valid from date and to date are required' });
        if (!cyclename) return res.status(400).json({ message: 'Year or leave cycle is required' });

        const elTypes = await LeaveType.find({
            colid,
            status: /^Active$/i,
            leavetypecategory: /^EL$/i
        }).lean();

        if (!elTypes.length) {
            return res.status(404).json({ message: 'No active EL leave types found' });
        }

        const attendanceRows = await HrEmployeeAttendance.find({
            colid,
            date: { $gte: fromdate, $lte: todate }
        }).select('employeeemail employeename date attendance status').lean();

        if (!attendanceRows.length) {
            return res.status(404).json({ message: 'No attendance records found for the selected dates' });
        }

        const employeeMap = new Map();
        const presentMap = {};
        attendanceRows.forEach((item) => {
            const email = text(item.employeeemail);
            const key = email.toLowerCase();
            if (!key) return;
            if (!employeeMap.has(key)) {
                employeeMap.set(key, {
                    employeeemail: email,
                    employeename: text(item.employeename)
                });
            }
            if (number(item.attendance) === 1) {
                if (!presentMap[key]) presentMap[key] = new Set();
                presentMap[key].add(text(item.date));
            }
        });

        const employeeEmails = [...employeeMap.values()].map((item) => item.employeeemail);
	        const users = await User.find({
	            colid,
	            $or: [{ email: { $in: employeeEmails } }, { user: { $in: employeeEmails } }]
	        }).select('name email user department role').lean();
	        const userMap = new Map();
	        users.forEach((item) => {
	            if (text(item.email)) userMap.set(text(item.email).toLowerCase(), item);
	            if (text(item.user)) userMap.set(text(item.user).toLowerCase(), item);
	        });

	        const accrualRules = await AccrualRule.find({
	            colid,
	            status: /^Active$/i
	        }).lean();
	        const ruleMap = new Map();
	        accrualRules.forEach((item) => {
	            const key = `${text(item.role).toLowerCase()}|${text(item.leavetype).toLowerCase()}`;
	            if (key !== '|') ruleMap.set(key, item);
	        });
	        const findAccrualRule = (role, leavetype) =>
	            ruleMap.get(`${text(role).toLowerCase()}|${text(leavetype).toLowerCase()}`)
	            || ruleMap.get(`all|${text(leavetype).toLowerCase()}`)
	            || null;

	        const results = [];
	        for (const employee of employeeMap.values()) {
	            const emailKey = text(employee.employeeemail).toLowerCase();
	            const employeeUser = userMap.get(emailKey) || {};
	            const employeename = text(employee.employeename || employeeUser.name);
	            const department = text(employeeUser.department);
	            const role = text(employeeUser.role);
	            const presentdays = presentMap[emailKey]?.size || 0;
	            const ratio = totaldays ? presentdays / totaldays : 0;

	            for (const type of elTypes) {
	                const accrualRule = findAccrualRule(role, type.leavetype);
	                const minimumdayspresent = number(accrualRule?.minimumdayspresent);
	                const proratemontlyleave = number(type.annualquota) / 12;
	                if (accrualRule && presentdays < minimumdayspresent) {
	                    results.push({
	                        id: `${emailKey}-${type._id}-skipped`,
	                        employeeemail: employee.employeeemail,
	                        employeename,
	                        department,
	                        role,
	                        cyclename,
	                        leavetype: type.leavetype,
	                        totaldays,
	                        presentdays,
	                        minimumdayspresent,
	                        attendanceratio: Number(ratio.toFixed(4)),
	                        proratemontlyleave: Number(proratemontlyleave.toFixed(2)),
	                        annualquota: number(type.annualquota),
	                        daysadded: 0,
	                        earned: 0,
	                        balance: 0,
	                        accrualstatus: 'Skipped',
	                        accrualremarks: `Minimum ${minimumdayspresent} present days required`
	                    });
	                    continue;
	                }
	                const daysadded = Number((ratio * proratemontlyleave).toFixed(2));

	                const balance = await LeaveBalance.findOneAndUpdate(
                    {
                        colid,
                        cyclename,
                        employeeemail: employee.employeeemail,
                        leavetype: type.leavetype
                    },
                    {
                        $setOnInsert: {
                            colid,
                            cyclename,
                            employeeemail: employee.employeeemail,
                            leavetype: type.leavetype,
                            openingbalance: 0,
                            carryforward: 0,
                            used: 0
                        },
                        $set: {
                            employeename,
                            department,
                            status: 'Active',
                            user
                        },
                        $inc: {
                            earned: daysadded,
                            balance: daysadded
                        }
                    },
                    { new: true, upsert: true, setDefaultsOnInsert: true }
                );

                results.push({
                    id: String(balance._id),
                    employeeemail: balance.employeeemail,
                    employeename: balance.employeename,
	                    department: balance.department,
	                    role,
	                    cyclename: balance.cyclename,
	                    leavetype: balance.leavetype,
	                    totaldays,
	                    presentdays,
	                    minimumdayspresent: accrualRule ? minimumdayspresent : '',
	                    attendanceratio: Number(ratio.toFixed(4)),
	                    proratemontlyleave: Number(proratemontlyleave.toFixed(2)),
	                    annualquota: number(type.annualquota),
	                    daysadded,
	                    earned: Number(number(balance.earned).toFixed(2)),
	                    balance: Number(number(balance.balance).toFixed(2)),
	                    accrualstatus: 'Added',
	                    accrualremarks: accrualRule ? 'Minimum present days rule satisfied' : 'No minimum present days rule configured'
	                });
	            }
	        }

	        res.json({
	            message: 'Earned leave added successfully',
	            totaldays,
	            count: results.length,
	            addedCount: results.filter((item) => item.accrualstatus === 'Added').length,
	            skippedCount: results.filter((item) => item.accrualstatus === 'Skipped').length,
	            results
	        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message, message: err.message });
    }
};
