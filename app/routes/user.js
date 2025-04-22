const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Assign a role to a user (admin/user)
router.post('/assign-role', async (req, res) => {
  const { userId, role } = req.body;

  if (!userId || !role) {
    return res.status(400).json({ error: 'User ID and role are required.' });
  }

  try {
    await req.app.locals.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { role } }
    );
    res.redirect('/');
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

module.exports = router;

