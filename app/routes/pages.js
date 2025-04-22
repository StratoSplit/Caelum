const express = require('express');
const router = express.Router();
const { validateToken } = require('../middleware/auth');
const mongoose = require('mongoose');

// Login view (no auth)
router.get('/login', (req, res) => res.render('login'));

// Profile view (requires auth)
router.get('/profile', validateToken, (req, res) => res.render('profile'));

// Main dashboard (with user, team, config data)
router.get('/', validateToken, async (req, res) => {
  const db = req.app.locals.db;

  try {
    const user = await db.collection('users').findOne({ userId: req.user.userId });
    if (!user) return res.status(404).render('error', { message: 'User not found' });

    const team = user.team
      ? await db.collection("teams").findOne({ _id: new mongoose.Types.ObjectId(user.team) })
      : null;

    const users = await db.collection('users').find().toArray();
    const teams = await db.collection('teams').find().toArray();
    const isAdmin = user.role === 'admin';

    res.render('index', { user, team, users, teams, isAdmin });
  } catch (error) {
    console.error('Error loading dashboard:', error);
    res.status(500).render('error', { message: 'Internal server error' });
  }
});

module.exports = router;

