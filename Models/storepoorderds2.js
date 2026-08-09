const mongoose = require('mongoose');

const storepoorderdsschema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter name']
    },
    user: {
        type: String,
        required: [true, 'Please enter user'],
        unique: false
    },
    colid: {
        type: Number,
        required: [true, 'Please enter colid']
    },
    year: {
        type: String
    },
    vendor: {
        type: String
    },
    vendorid: {
        type: String
    },
    poid: {
        type: String
    },
    prnumber: {
        type: String
    },
    storeid: {
        type: String
    },
    storename: {
        type: String
    },
    store: {
        type: String
    },
    price: {
        type: Number
    },
    amount: {
        type: Number
    },
    gst: {
        type: Number
    },
    discount: {
        type: Number
    },
    description: {
        type: String
    },
    returnamount: {
        type: Number
    },
    netprice: {
        type: Number
    },
    updatedate: {
        type: Date
    },
    // Dynamic Approval Fields
    currentStep: { type: Number, default: 1 },
    approvalStatus: { type: String, default: 'Pending' },
    doclink: { type: String },
    creatorName: { type: String },
    creatorEmail: { type: String },
    creatorSignature: { type: String },
    terms: { type: String },
    warranty: { type: String },
    remarks: { type: String },
    approvalhistory: { type: Array, default: [] },

    // Phase 1 Additions (SAP-Inspired Flow)
    postatus: {
        type: String,
        default: 'Draft'
    },
    deliveryType: {
        type: String,
        default: 'Physical Delivery'
    },
    poType: {
        type: String, // e.g. 'Standard', 'Local'
        default: 'Standard'
    },
    approxAmount: {
        type: Number // Used for Local POs
    },
    actualAmount: {
        type: Number // Used for Local POs
    }
}, { timestamps: true });

const storepoorderds2 = mongoose.model('storepoorderds2', storepoorderdsschema);

module.exports = storepoorderds2;
