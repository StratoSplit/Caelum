const express = require('express');
const router = express.Router();
const { sendCommand } = require('../utils/streamControl');

// POST: Start or Stop audio stream generation
router.post('/admin/control-streams', (req, res) => {
  const { action, channels, duration } = req.body;

  if (!["start", "stop"].includes(action)) {
    return res.status(400).json({ message: "Invalid action." });
  }

  if (action === "start" && (!Array.isArray(channels) || channels.length === 0)) {
    return res.status(400).json({ message: "No channels selected." });
  }

  sendCommand(action, action === "start" ? channels.map(Number) : [], Number(duration) || 15);
  res.json({ message: `Command '${action}' sent successfully.` });
});

module.exports = router;
