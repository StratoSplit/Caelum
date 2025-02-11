const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const configurationSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    configName: {
        type: String,
        required: true
    },
    configData: {
        type: Object,
        required: true
    }
});

configurationSchema.index({ username: 1, configName: 1 }, { unique: true }); // Ensure unique configurations per user

const Configuration = mongoose.model('Configuration', configurationSchema);

module.exports = Configuration;