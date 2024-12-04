const { Schema, model } = require('mongoose');

const configurationSchema = new Schema({
  username: { type: String, required: true },
  configName: { type: String, required: true },
  configData: { type: Object, required: true }
});

const Configuration = model('Configuration', configurationSchema);

module.exports = Configuration;

