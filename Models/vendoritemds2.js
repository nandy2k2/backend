const mongoose = require('mongoose');

const vendoritemdsschema = new mongoose.Schema({
    name: { type: String, required: true },
    user: { type: String, required: true },
    colid: { type: Number, required: true },

    vendorname: { type: String },
    vendorid: { type: String },
    itemcode: String,
    mappingtype: {type:String,enum:['Item','Category'],default:'Item'},
    verified: {type:String,enum:['Yes','No'],default:'No'},
    itemid: { type: String },
    item: { type: String }, // itemname
    price: { type: Number },
    discount: { type: Number },
    status: { type: String },
    type: { type: String },
    unit: { type: String },
    unitcode: { type: String },
    gst: { type: Number },
    sgst: { type: Number },
    cgst: { type: Number },
    igst: { type: Number },
    total: { type: Number },
    category: { type: String },
});

const vendoritemds2 = mongoose.model('vendoritemds2', vendoritemdsschema);
module.exports = vendoritemds2;
