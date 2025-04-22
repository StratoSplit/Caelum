const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Create a new team
router.post('/admin/create-team', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    const teamData = {
      name: name.trim(),
      channels: [],
      createdAt: new Date()
    };

    const existing = await req.app.locals.db.collection('teams').findOne({ name: teamData.name });

    if (existing) {
      return res.status(400).json({ message: 'Team already exists.' });
    }

    const result = await req.app.locals.db.collection('teams').insertOne(teamData);
    return res.status(200).json({ id: result.insertedId });
  } catch (err) {
    console.error('Error creating team:', err);
    return res.status(500).json({ error: 'Failed to create team.' });
  }
});

// Get all teams
router.get('/get-teams', async (req, res) => {
  try {
    const teams = await req.app.locals.db.collection('teams').find().toArray();
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Delete a team
router.post('/admin/delete-team', async (req, res) => {
  const { teamId } = req.body;

  if (!teamId) {
    return res.status(400).json({ error: 'Team ID is required.' });
  }

  try {
    await req.app.locals.db.collection('users').updateMany(
      { team: teamId },
      { $unset: { team: "" } }
    );

    await req.app.locals.db.collection('teams').deleteOne({ _id: new mongoose.Types.ObjectId(teamId) });

    res.status(200).json({ message: 'Team deleted successfully.' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// Assign a team to a user
router.post('/assign-team', async (req, res) => {
  const { userId, teamId } = req.body;
  await req.app.locals.db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { team: teamId } }
  );
  res.redirect('/');
});

// Assign channels to a team
router.post('/assign-numbers', async (req, res) => {
  const { teamId, numbers } = req.body;
  const channels = Object.values(numbers).map(Number);
  await req.app.locals.db.collection('teams').updateOne(
    { _id: new mongoose.Types.ObjectId(teamId) },
    { $set: { channels } }
  );
  res.redirect('/');
});

module.exports = router;

