const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  teamId: { type: Number, required: true, unique: true },
  channels: { type: [Number], default: [] }
});

module.exports = mongoose.model('Team', TeamSchema);

