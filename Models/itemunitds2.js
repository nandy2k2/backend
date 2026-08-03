const mongoose = require('mongoose');

const itemunitdsschema = mongoose.Schema({
    name: { type: String, required: true },
    user: { type: String, required: true },
    colid: { type: Number, required: true },
    unitname: { type: String },
    unitcode: { type: String },
    description: { type: String },
    status: { type: String },

}, {
    timestamps: true
});

const itemunitds2 = mongoose.model("itemunitds2", itemunitdsschema);

module.exports = itemunitds2;
