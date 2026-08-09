const mongoose = require('mongoose');

const storepoitemsdsschema = new mongoose.Schema({
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
    poid: {
        type: String
    },
    vendor: {
        type: String
    },
    vendorid: {
        type: String
    },
    quantity: {
        type: Number
    },
    price: {
        type: Number
    },
    description: {
        type: String
    },
    reqdate: {
        type: Date
    },
    postatus: {
        type: String
    },
    itemid: {
        type: String
    },
    itemname: {
        type: String
    },
    itemcode: {
        type: String
    },
    storeid: {
        type: String
    },
    storename: {
        type: String
    },
    // New Fields for Tax & Classification
    category: { type: String },
    itemtype: { type: String }, // This field already exists, keeping its original definition.
    unit: { type: String },
    gst: { type: Number },      // Tax %
    discount: { type: Number },
    sgst: { type: Number },
    cgst: { type: Number },
    igst: { type: Number },
    total: { type: Number },    // Line total (qty * priceWithTax or just total)
    unitPriceWithTax: { type: Number },
    status1: {
        type: String
    },
    comments: {
        type: String
    },
    make: {
        type: String
    },
    terms: {
        type: String
    },
    warranty: {
        type: String
    },
    storereqid: {
        type: String // Link to original Store Requisition
    },
    // Shipment Tracking Fields
    gateReceivedQuantity: {
        type: Number,
        default: 0
    },
    acceptedQuantity: {
        type: Number,
        default: 0
    },
    rejectedQuantity: {
        type: Number,
        default: 0
    }
})
//
const storepoitemsds2 = mongoose.model('storepoitemsds2', storepoitemsdsschema);

module.exports = storepoitemsds2;

