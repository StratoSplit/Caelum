const mongoose = require('mongoose');

const OperatorSchema = new mongoose.Schema({
    username: String,
    email: String,
    password: String,
});

const OperatorModel = mongoose.model("operator", OperatorSchema);

module.exports = OperatorModel;