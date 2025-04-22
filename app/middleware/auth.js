require('dotenv').config();
const mongoose = require('mongoose');

async function validateToken(req, res, next) {
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.hanko) {
    token = req.cookies.hanko;
  }

  if (!token) {
    return res.render('login');
  }

  try {
    const response = await fetch(`${process.env.HANKO_API_URL.replace(/\$/, '')}/sessions/validate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_token: token }),
    });

    if (!response.ok) {
      console.error('Session validation failed:', await response.text());
      return res.redirect('/login');
    }

    const session = await response.json();
    if (!session.is_valid) {
      return res.redirect('/login');
    }

    // Current user data from session
    const currentUserData = {
      userId: session.user_id,
      username: session.claims.username,
      email: session.claims.email.address,
      lastLogin: new Date()
    };

    try {
      // Find existing user
      const db = req.app.locals.db;
      const existingUser = await db.collection('users').findOne({ userId: currentUserData.userId });
      
      if (existingUser) {
        // Check for changes in email or username
        const updates = {
          lastLogin: currentUserData.lastLogin
        };

        if (existingUser.email !== currentUserData.email) {
          updates.email = currentUserData.email;
        }
        if (existingUser.username !== currentUserData.username) {
          updates.username = currentUserData.username;
        }

        // Update user if there are changes
        if (Object.keys(updates).length > 1) { // more than just lastLogin
          await db.collection('users').updateOne(
            { userId: currentUserData.userId },
            { $set: updates }
          );
          console.log('User details updated:', updates);
        }
      } else {
        // Create new user if doesn't exist
        await db.collection('users').insertOne({
          ...currentUserData,
          createdAt: new Date()
        });
        console.log('New user created:', currentUserData);
      }

      req.user = currentUserData;
      next();
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue even if DB operation fails
      req.user = currentUserData;
      next();
    }
  } catch (error) {
    console.error('Token validation error:', error);
    res.redirect('/login');
  }
}

module.exports = { validateToken };
