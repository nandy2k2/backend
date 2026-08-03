const mongoose = require('mongoose');

const itemcatdsschema = mongoose.Schema({
    name: { type: String, required: true },
    user: { type: String, required: true },
    colid: { type: Number, required: true },
    categoryname: { type: String },
    description: { type: String },
    status: { type: String },

}, {
    timestamps: true
});

const itemcategoryds2 = mongoose.model("itemcategoryds2", itemcatdsschema);

module.exports = itemcategoryds2;
