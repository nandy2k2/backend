const { preparePoPayload, recalculatePoTotals } = require("./purchase2crudctlrds");
const storepoitemsds2 = require("../Models/storepoitemsds2");

exports.addstorepoitemsds2 = async (req, res) => {
    try {
        // Validations for Phase 1
        const storepoorderds2 = require("../Models/storepoorderds2");
        const poOrder = await storepoorderds2.findOne({ poid: req.body.poid, colid: req.body.colid });
        if (poOrder && poOrder.postatus && poOrder.postatus !== 'Draft' && poOrder.poType !== 'Local') {
            return res.status(400).json({ success: false, message: "PO is not in Draft state. Items cannot be added." });
        }

        const storerequisationds2 = require("../Models/storerequisationds2");
        if (req.body.storereqid) {
            const reqData = await storerequisationds2.findById(req.body.storereqid);
            if (reqData && req.body.quantity > reqData.quantity) {
                return res.status(400).json({ success: false, message: `PO item quantity (${req.body.quantity}) cannot exceed Original PR item quantity (${reqData.quantity}).` });
            }
        }

        await preparePoPayload("storepoitemsds2", req.body);
        const newItem = await storepoitemsds2.create(req.body);
        await recalculatePoTotals(newItem.colid, newItem.poid);

        // --- Budget Deduction ---
        if (req.body.category && req.body.year && req.body.colid && req.body.total) {
            const budgetpocatds = require("../Models/budgetpocatds");
            const budgetpods = require("../Models/budgetpods");
            const pocats = await budgetpocatds.find({
                colid: req.body.colid,
                year: req.body.year,
                category: req.body.category
            });
            if (pocats.length > 0) {
                const pocat = pocats[0];
                pocat.amount = (pocat.amount || 0) - Number(req.body.total);
                await pocat.save();

                if (pocat.budgetid) {
                    const siblingCats = await budgetpocatds.find({ budgetid: pocat.budgetid });
                    const newTotal = siblingCats.reduce((sum, c) => sum + (c.amount || 0), 0);
                    await budgetpods.findByIdAndUpdate(pocat.budgetid, { amount: newTotal });
                }
            }
        }
        // --- End Budget Deduction ---

        // Update Store Requisition Status if linked
        if (req.body.storereqid) {
            const currentReq = await storerequisationds2.findById(req.body.storereqid);
            if (currentReq) {
                const newOrderedQuantity = (currentReq.orderedQuantity || 0) + req.body.quantity;
                const newStatus = newOrderedQuantity >= currentReq.quantity ? 'Completed' : 'Assigned';
                await storerequisationds2.findByIdAndUpdate(req.body.storereqid, {
                    orderedQuantity: newOrderedQuantity,
                    reqstatus: newStatus
                });
            }
        }

        res.status(201).json({
            success: true,
            message: "Store PO Item added successfully",
            data: newItem
        });
    } catch (error) {
        console.error("Error in addstorepoitemsds2:", error);
        res.status(500).json({
            success: false,
            message: "Error adding PO item",
            error: error.message
        });
    }
};

exports.getallstorepoitemsds2 = async (req, res) => {
    try {
        const { colid, poid } = req.query;
        let query = { colid };
        if (poid) query.poid = poid;
        
        const poItems = await storepoitemsds2.find(query);
        res.status(200).json({
            success: true,
            count: poItems.length,
            data: { poItems }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching PO items",
            error: error.message
        });
    }
};

exports.updatestorepoitemsds2 = async (req, res) => {
    try {
        const { id } = req.query;
        const existingItem = await storepoitemsds2.findById(id);
        if (!existingItem) return res.status(404).json({ success: false, message: "PO Item not found" });

        // Phase 1 Draft Validation
        const storepoorderds2 = require("../Models/storepoorderds2");
        const poOrder = await storepoorderds2.findOne({ poid: existingItem.poid, colid: existingItem.colid });

        if (poOrder && poOrder.postatus && poOrder.postatus !== 'Draft') {
            return res.status(400).json({ success: false, message: "PO is not in Draft state. Items cannot be modified." });
        }

        if (req.body.quantity && existingItem.storereqid) {
            const storerequisationds2 = require("../Models/storerequisationds2");
            const reqData = await storerequisationds2.findById(existingItem.storereqid);
            if (reqData && req.body.quantity > reqData.quantity) {
                return res.status(400).json({ success: false, message: `PO item quantity (${req.body.quantity}) cannot exceed Original PR item quantity (${reqData.quantity}).` });
            }
        }

        // Log Revision
        if (req.body.quantity && req.body.quantity !== existingItem.quantity && poOrder) {
            const pologds2 = require("../Models/pologds2");
            await pologds2.create({
                poid: poOrder.poid,
                po_object_id: poOrder._id,
                action: 'Modified',
                user: req.body.user || existingItem.user,
                colid: poOrder.colid,
                remarks: 'Item quantity revised during draft.',
                changes: [{
                    itemId: existingItem.itemid,
                    itemname: existingItem.itemname,
                    originalQty: existingItem.quantity,
                    revisedQty: req.body.quantity
                }]
            });
        }

        req.body.colid = existingItem.colid;
        await preparePoPayload("storepoitemsds2", req.body, existingItem.toObject());
        const updatedItem = await storepoitemsds2.findByIdAndUpdate(id, req.body, { new: true });
        await recalculatePoTotals(updatedItem.colid, updatedItem.poid);
        if (existingItem.poid !== updatedItem.poid) await recalculatePoTotals(existingItem.colid, existingItem.poid);

        // --- Budget Adjustment ---
        if (req.body.total !== undefined && existingItem.total !== undefined && updatedItem.category && updatedItem.year && updatedItem.colid) {
            const diff = Number(req.body.total) - Number(existingItem.total);
            if (diff !== 0) {
                const budgetpocatds = require("../Models/budgetpocatds");
                const budgetpods = require("../Models/budgetpods");
                const pocats = await budgetpocatds.find({
                    colid: updatedItem.colid,
                    year: updatedItem.year,
                    category: updatedItem.category
                });
                if (pocats.length > 0) {
                    const pocat = pocats[0];
                    pocat.amount = (pocat.amount || 0) - diff;
                    await pocat.save();
                    
                    if (pocat.budgetid) {
                        const siblingCats = await budgetpocatds.find({ budgetid: pocat.budgetid });
                        const newTotal = siblingCats.reduce((sum, c) => sum + (c.amount || 0), 0);
                        await budgetpods.findByIdAndUpdate(pocat.budgetid, { amount: newTotal });
                    }
                }
            }
        }
        // --- End Budget Adjustment ---

        // Update PR tracking if quantity changed
        if (req.body.quantity && req.body.quantity !== existingItem.quantity && existingItem.storereqid) {
            const storerequisationds2 = require("../Models/storerequisationds2");
            const currentReq = await storerequisationds2.findById(existingItem.storereqid);
            if (currentReq) {
                const diff = req.body.quantity - existingItem.quantity;
                const newOrderedQuantity = Math.max(0, (currentReq.orderedQuantity || 0) + diff);
                const newStatus = newOrderedQuantity >= currentReq.quantity ? 'Completed' : 'Assigned';
                await storerequisationds2.findByIdAndUpdate(existingItem.storereqid, {
                    orderedQuantity: newOrderedQuantity,
                    reqstatus: newStatus
                });
            }
        }

        if (!updatedItem) return res.status(404).json({ success: false, message: "PO Item not found" });
        res.status(200).json({
            success: true,
            message: "PO Item updated",
            data: updatedItem
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error updating PO item",
            error: error.message
        });
    }
};

exports.deletestorepoitemsds2 = async (req, res) => {
    try {
        const { id } = req.query;
        const existingItem = await storepoitemsds2.findById(id);
        if (!existingItem) return res.status(404).json({ success: false, message: "PO Item not found" });

        const storepoorderds2 = require("../Models/storepoorderds2");
        const poOrder = await storepoorderds2.findOne({ poid: existingItem.poid, colid: existingItem.colid });
        if (poOrder && poOrder.postatus && poOrder.postatus !== 'Draft') {
            return res.status(400).json({ success: false, message: "PO is not in Draft state. Items cannot be removed." });
        }

        await storepoitemsds2.findByIdAndDelete(id);
        await recalculatePoTotals(existingItem.colid, existingItem.poid);

        // --- Budget Refund ---
        if (existingItem.category && existingItem.year && existingItem.colid && existingItem.total) {
            const budgetpocatds = require("../Models/budgetpocatds");
            const budgetpods = require("../Models/budgetpods");
            const pocats = await budgetpocatds.find({
                colid: existingItem.colid,
                year: existingItem.year,
                category: existingItem.category
            });
            if (pocats.length > 0) {
                const pocat = pocats[0];
                pocat.amount = (pocat.amount || 0) + Number(existingItem.total);
                await pocat.save();
                
                if (pocat.budgetid) {
                    const siblingCats = await budgetpocatds.find({ budgetid: pocat.budgetid });
                    const newTotal = siblingCats.reduce((sum, c) => sum + (c.amount || 0), 0);
                    await budgetpods.findByIdAndUpdate(pocat.budgetid, { amount: newTotal });
                }
            }
        }
        // --- End Budget Refund ---

        if (existingItem.storereqid) {
            const storerequisationds2 = require("../Models/storerequisationds2");
            const currentReq = await storerequisationds2.findById(existingItem.storereqid);
            if (currentReq) {
                const newOrderedQuantity = Math.max(0, (currentReq.orderedQuantity || 0) - existingItem.quantity);
                const newStatus = newOrderedQuantity > 0 ? 'Assigned' : 'Approved'; // Revert status
                await storerequisationds2.findByIdAndUpdate(existingItem.storereqid, {
                    orderedQuantity: newOrderedQuantity,
                    reqstatus: newStatus
                });
            }
        }

        res.status(200).json({ success: true, message: "PO Item deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting PO item", error: error.message });
    }
};

exports.getstorepoitemsdsbyid2 = async (req, res) => {
    try {
        const { id } = req.query;
        const item = await storepoitemsds2.findById(id);
        if (!item) return res.status(404).json({ success: false, message: "PO Item not found" });
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching PO item", error: error.message });
    }
};
