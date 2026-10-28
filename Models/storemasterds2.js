const mongoose = require("mongoose");

const storemasterschema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    user: {
        type: String,
        required: true
    },
    colid: {
        type: Number,
        required: true
    },
    storename: {
        type: String,
    },
    address: String,
    email: String,
    contactperson: String,
    contactnumber: String,
    location: {
        type: String
    },
    phone: {
        type: String
    },
    storemanager: {
        type: String
    }
})

const storemasterds2 = mongoose.model("storemasterds2", storemasterschema);

module.exports = storemasterds2;
