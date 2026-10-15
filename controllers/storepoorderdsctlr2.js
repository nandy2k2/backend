const { preparePoPayload, recalculatePoTotals } = require("./purchase2crudctlrds");
const storepoorderds2 = require("../Models/storepoorderds2");

exports.addstorepoorderds2 = async (req, res) => {
    try {
        await preparePoPayload("storepoorderds2", req.body);
        const newPO = await storepoorderds2.create(req.body);

        // Write audit log
        const pologds2 = require('../Models/pologds2');
        await pologds2.create({
            poid: newPO.poid,
            po_object_id: newPO._id,
            action: 'Created',
            user: newPO.user || 'System',
            userName: newPO.creatorName || newPO.user || 'System',
            colid: newPO.colid,
            remarks: `PO created as ${newPO.postatus || 'Draft'} by ${newPO.creatorName || newPO.user}`
        });

        res.status(201).json({
            success: true,
            message: 'Store PO added successfully',
            data: newPO
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error adding store PO',
            error: error.message
        });
    }
};

exports.getallstorepoorderds2 = async (req, res) => {
    try {
        const { colid, page, limit } = req.query;
        const query = { colid };

        if (page && limit) {
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;

            const total = await storepoorderds2.countDocuments(query);
            const poOrders = await storepoorderds2.find(query)
                .sort({ _id: -1 })
                .skip(skip)
                .limit(limitNum);

            res.status(200).json({
                success: true,
                count: poOrders.length,
                total,
                data: { poOrders },
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                }
            });
        } else {
            const poOrders = await storepoorderds2.find(query).sort({ _id: -1 });
            res.status(200).json({
                success: true,
                count: poOrders.length,
                data: { poOrders } // Kept { poOrders } as per original
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching store POs",
            error: error.message
        });
    }
};

exports.updatestorepoorderds2 = async (req, res) => {
    try {
        const { id } = req.query;
        const existing = await storepoorderds2.findById(id);
        if (!existing) return res.status(404).json({ success: false, message: "PO not found" });
        req.body.colid = existing.colid;
        await preparePoPayload("storepoorderds2", req.body, existing.toObject());
        await storepoorderds2.findByIdAndUpdate(id, req.body, { new: true });
        const updatedPO = await recalculatePoTotals(existing.colid, req.body.poid);
        if (!updatedPO) return res.status(404).json({ success: false, message: "PO not found" });
        res.status(200).json({
            success: true,
            message: "PO updated",
            data: updatedPO
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating PO",
            error: error.message
        });
    }
};

exports.deletestorepoorderds2 = async (req, res) => {
    try {
        const { id } = req.query;
        await storepoorderds2.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "PO deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting PO", error: error.message });
    }
};

exports.getstorepoorderdsbyid2 = async (req, res) => {
    try {
        const { id } = req.query;
        const po = await storepoorderds2.findById(id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });
        res.status(200).json({ success: true, data: po });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching PO", error: error.message });
    }
};

exports.approveStorePO2 = async (req, res) => {
    try {
        const { poid, status, user } = req.body;
        // Logic to approve PO (finding by poid string or _id depending on usage)
        // Assuming _id for update consistency for now
        const updatedPO = await storepoorderds2.findByIdAndUpdate(poid, { postatus: status }, { new: true });

        if (!updatedPO) return res.status(404).json({ message: "PO not found" });

        res.status(200).json({ success: true, message: "PO Approved", data: updatedPO });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error approving PO", error: error.message });
    }
};



exports.verifyDynamicStep2 = async (req, res) => {
    try {
        const { id, user_email } = req.body;
        const approvalconfigds2 = require("../Models/approvalconfigds2");

        const po = await storepoorderds2.findById(id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });

        // Fetch Config Steps
        const steps = await approvalconfigds2.find({ colid: po.colid, module: 'Purchase Order' }).sort({ stepNumber: 1 });

        if (steps.length === 0) {
            return res.status(400).json({ success: false, message: "No approval configuration found." });
        }

        const currentStepIndex = po.currentStep - 1; // 1-based to 0-based
        if (currentStepIndex >= steps.length) {
            return res.status(400).json({ success: false, message: "Already fully approved." });
        }

        const stepConfig = steps[currentStepIndex];

        // Authorization Check
        if (stepConfig.approverEmail !== user_email) {
            return res.status(403).json({ success: false, message: `Unauthorized. Waiting for ${stepConfig.approverEmail}` });
        }

        // Proceed with Approval
        // Create Approval Action Log in separate table
        const storepoapprovalds2 = require("../Models/storepoapprovalds2");
        await storepoapprovalds2.create({
            colid: po.colid,
            poid: po.poid, // or po._id if linking by ID primarily, but poid is string identifier
            stepNumber: po.currentStep,
            approverEmail: user_email,
            action: 'Approved',
            user: user_email, // Using email as username ref
            actionDate: new Date()
        });

        const nextStep = po.currentStep + 1;

        if (nextStep > steps.length) {
            // All Steps Completed
            po.postatus = 'Approved';
            po.approvalStatus = 'Completed';
            // po.level = steps.length; // Legacy
        } else {
            // Move to Next Step
            po.currentStep = nextStep;
            po.postatus = `Pending Step ${nextStep}`;
            po.approvalStatus = `Pending Step ${nextStep}`;
            // po.level = po.currentStep - 1; // Legacy
        }

        await po.save();
        res.status(200).json({ success: true, message: `Step ${po.currentStep - 1} Verified`, data: po });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error verifying step", error: error.message });
    }
};

exports.sendBackDynamicStep2 = async (req, res) => {
    try {
        const { id, user_email, remarks } = req.body;
        const approvalconfigds2 = require("../Models/approvalconfigds2");

        const po = await storepoorderds2.findById(id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });

        const steps = await approvalconfigds2.find({ colid: po.colid, module: 'Purchase Order' }).sort({ stepNumber: 1 });

        if (steps.length === 0) {
            return res.status(400).json({ success: false, message: "No approval configuration found." });
        }

        const currentStepIndex = po.currentStep - 1;
        if (currentStepIndex >= steps.length || currentStepIndex < 0) {
            return res.status(400).json({ success: false, message: "Invalid step state." });
        }

        const stepConfig = steps[currentStepIndex];

        if (stepConfig.approverEmail !== user_email) {
            return res.status(403).json({ success: false, message: `Unauthorized. Only ${stepConfig.approverEmail} can send this back.` });
        }

        let previousStep = po.currentStep - 1;
        let newStatus = '';
        if (previousStep < 1) {
            previousStep = 1;
            newStatus = 'Submitted';
        } else {
            newStatus = `Pending Step ${previousStep}`;
        }

        po.currentStep = previousStep;
        po.postatus = newStatus;
        po.approvalStatus = newStatus;
        await po.save();

        const storepoapprovalds2 = require("../Models/storepoapprovalds2");
        await storepoapprovalds2.create({
            colid: po.colid,
            poid: po.poid,
            stepNumber: po.currentStep + 1,
            approverEmail: user_email,
            action: 'Sent Back',
            user: user_email,
            actionDate: new Date(),
            remarks: remarks || 'Sent back for revisions'
        });

        res.status(200).json({ success: true, message: `Sent back to Step ${previousStep}`, data: po });

    } catch (error) {
        res.status(500).json({ success: false, message: "Error sending back", error: error.message });
    }
};

exports.requestPOEdit2 = async (req, res) => {
    try {
        const { id, user } = req.body; // Using mongo ID for exact match
        const po = await storepoorderds2.findById(id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });

        po.postatus = 'EditRequested';
        await po.save();

        const pologds2 = require("../Models/pologds2");
        await pologds2.create({
            poid: po.poid,
            po_object_id: po._id,
            action: 'EditRequested',
            user: user || po.creatorName || 'System',
            colid: po.colid,
            remarks: 'Purchase Executive requested permission to edit a submitted PO.'
        });

        res.status(200).json({ success: true, message: "Edit request sent to manager", data: po });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error requesting PO edit", error: error.message });
    }
};

exports.approvePOEdit2 = async (req, res) => {
    try {
        const { id, user, approved } = req.body;
        const po = await storepoorderds2.findById(id);
        if (!po) return res.status(404).json({ success: false, message: "PO not found" });

        po.postatus = approved ? 'Draft' : 'Submitted';
        await po.save();

        const pologds2 = require("../Models/pologds2");
        await pologds2.create({
            poid: po.poid,
            po_object_id: po._id,
            action: approved ? 'EditApproved' : 'EditRejected',
            user: user || po.creatorName || 'System',
            colid: po.colid,
            remarks: `Purchase Manager ${approved ? 'approved' : 'rejected'} PO edit request.`
        });

        res.status(200).json({ success: true, message: `Edit request ${approved ? 'approved' : 'rejected'}`, data: po });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error responding to PO edit", error: error.message });
    }
};
