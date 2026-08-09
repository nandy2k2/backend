const mongoose = require('mongoose');

const storerequisationschema = new mongoose.Schema({
    name: { type: String, required: true },
    user: { type: String, required: true },
    colid: { type: Number, required: true },

    year: { type: String },
    itemcode: { type: String },
    itemname: { type: String },
    store: { type: String },
    storeid: { type: String },
    storename: { type: String },
    reqdate: { type: Date },
    requestdate: { type: Date },
    reqid: { type: String },
    requestno: { type: String },
    requestedby: { type: String },
    requestedbyemail: { type: String },
    creatoruserid: { type: String },
    departmentname: { type: String },
    quantity: { type: Number },
    orderedQuantity: { type: Number, default: 0 },
    reqstatus: { type: String },
    approvalStatus: { type: String },
    approvalOption: { type: String },
    approvaltype: { type: String },
    approvername: { type: String },
    approveruserid: { type: String },
    hoiapprovername: { type: String },
    hoiapproveruserid: { type: String },
    approvedby: { type: String },
    approvedbyemail: { type: String },
    approveddate: { type: Date },
    approversignature: { type: String },
    approvalremarks: { type: String },
    poid: { type: String },
    prnumber: { type: String },
    assignedTo: { type: String },       // Email of PE/SPE assigned
    assignedToName: { type: String },   // Display name of assignee
    unit: { type: String },             // e.g. 'Nos', 'Kg', 'Box'
    itemid: { type: String },           // Master item _id reference
    category: { type: String },
    itemtype: { type: String },
    remarks: { type: String },
    allotdate: { type: Date },
    allottedby: { type: String },
    allottedbyemail: { type: String }
});

const storerequisationds2 = mongoose.model('storerequisationds2', storerequisationschema);
module.exports = storerequisationds2;
