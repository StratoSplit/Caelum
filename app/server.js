const dgram = require('dgram');
const https = require('https');
const fs = require('fs');
const express = require('express');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const connectToDatabase = require('./db');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv').config;
const mongoose = require('mongoose');
const session = require('express-session');
const app = express();
const HTTPS_PORT = 443;
const UDP_TARGET = "239.0.0.11";
const UDP_PORT = 5000;

// Load SSL keys
const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// Define multicast groups
const multicastGroups = Array.from({ length: 10 }, (_, i) => ({
  address: `239.0.0.${i + 1}`,
  port: 5001 + i * 2
}));

// Create socket array
const SOCKET_EVENTS = multicastGroups.map((_, i) => `audio-stream-${i + 1}`);

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Parse incoming request bodies
app.use(cookieParser());

// Add body parsing middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to DB
let db;
connectToDatabase().then(database => {
  db = database;
});


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
    const response = await fetch('https://65b795cd-6728-46f7-9d07-55dbb42b3c8a.hanko.io/sessions/validate', {
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

app.get('/profile', validateToken, (req, res) => res.render('profile'));
app.get('/login', (req, res) => res.render('login'));


app.get('/', validateToken, async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ userId: req.user.userId });
    
    if (!user) {
      // This shouldn't happen as the user was just validated, but handle it just in case
      return res.status(404).render('error', { message: 'User not found' });
    }
    
    let team = null;
    if (user.team) {
      team = await db.collection("teams").findOne({ _id: new mongoose.Types.ObjectId(user.team) });
    }
    
    const users = await db.collection('users').find().toArray();
    const teams = await db.collection('teams').find().toArray();
    const isAdmin = user.role === 'admin';

    res.render('index', { user, team, users, teams, isAdmin });
  } catch (error) {
    console.error('Error retrieving user data:', error);
    res.status(500).render('error', { message: 'Internal server error' });
  }
});

// Debug route to check saved configurations
app.get('/debug/configurations', async (req, res) => {
  try {
    const configurations = await db.collection('configurations').find().toArray();
    res.json({
      count: configurations.length,
      configurations
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Error retrieving configurations' });
  }
});

// Save Configuration Route
app.post('/save-configuration', validateToken, async (req, res) => {
  const { configName, configData } = req.body;
  const userId = req.user.userId;

  if (!configName || !configData) {
    return res.status(400).json({ error: 'Configuration name and data are required.' });
  }

  try {
    console.log('Saving configuration to database:', { 
      userId, 
      configName, 
      configDataSample: JSON.stringify(configData).substring(0, 100) + '...' 
    });

    // Include username from user data for better identification
    await db.collection('configurations').updateOne(
      { userId, configName },
      {
        $set: {
          userId,
          username: req.user.username,
          configName,
          configData,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    res.status(200).json({ message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Save configuration error:', error);
    res.status(500).json({ error: 'Failed to save configuration: ' + error.message });
  }
});

// Get Configurations Route
app.get('/get-configurations', validateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const configurations = await db.collection('configurations')
      .find({ userId })
      .project({ configName: 1, _id: 0 })
      .toArray();

    const configNames = configurations.map(config => config.configName);
    console.log('Retrieved configurations:', { userId, count: configNames.length });
    res.json(configNames);
  } catch (error) {
    console.error('Get configurations error:', error);
    res.status(500).json({ error: 'Failed to retrieve configurations' });
  }
});

// Get Specific Configuration Route
app.get('/get-configuration', validateToken, async (req, res) => {
  const userId = req.user.userId;
  const configName = req.query.name;

  if (!configName) {
    return res.status(400).json({ error: 'Configuration name is required' });
  }

  try {
    const configuration = await db.collection('configurations').findOne(
      { userId, configName },
      { projection: { configData: 1, _id: 0 } }
    );

    if (!configuration) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    console.log('Retrieved configuration:', { userId, configName });
    res.json(configuration.configData);
  } catch (error) {
    console.error('Get configuration error:', error);
    res.status(500).json({ error: 'Failed to retrieve configuration' });
  }
});

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).send('Access Denied');
  }
  next();
}

// Route to assign user role
app.post('/assign-role' , async (req, res) => {
  const { userId, role } = req.body;
  await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { role } }
  );
  res.redirect('/');
});

// Route to assign user team
app.post('/assign-team', async (req, res) => {
  const { userId, teamId } = req.body;
  await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { team: teamId } }
  );
  res.redirect('/');
});

// Route to assign channels to teams
app.post('/assign-numbers', async (req, res) => {
  const { teamId, numbers } = req.body;
  const channels = Object.values(numbers).map(Number);
  await db.collection('teams').updateOne(
    { _id: new mongoose.Types.ObjectId(teamId) },
    { $set: { channels } }
  );
  res.redirect('/');
});

// Define server
const server = https.createServer(options, app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Function to send stream generation command
function sendCommand(command, channels = [], duration = 15) {
  const client = dgram.createSocket("udp4");

  client.bind(() => {
    try {
      client.setMulticastLoopback(false);
    } catch (err) {
      console.error("Failed to disable multicast loopback:", err.message);
    }

    // construct message to be parsed by generator
    const message = JSON.stringify({ command, channels, duration });

    // send message to target
    client.send(message, UDP_PORT, UDP_TARGET, (err) => {
      if (err) console.error("Error sending message:", err);
      else console.log(`[${new Date().toISOString()}] Sent: ${message}`);

      setTimeout(() => client.close(), 200);
    });
  });
}

// Route to create stream generation message 
app.post("/admin/control-streams", (req, res) => {
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

// Route to delete a config
app.delete('/delete-configuration', validateToken, async (req, res) => {
  const userId = req.user.userId;
  const configName = req.query.name;

  if (!configName) {
    return res.status(400).json({ error: 'Configuration name is required' });
  }

  try {
    const result = await db.collection('configurations').deleteOne({ userId, configName });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Configuration not found or already deleted' });
    }

    res.status(200).json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting configuration:', error);
    res.status(500).json({ error: 'Failed to delete configuration' });
  }
});

// Route to create a new team
app.post('/admin/create-team', async (req, res) => {
  try {
    const { name } = req.body;
    // if no name send err
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Team name is required.' });
    }

    const teamData = {
      name: name.trim(),
      channels: [],
      createdAt: new Date()
    };

    const existing = await db.collection('teams').findOne({ name: teamData.name });

    if (existing) {
      return res.status(400).json({ message: 'Team already exists.' });
    }

    const result = await db.collection('teams').insertOne(teamData);
    return res.status(200).json({ id: result.insertedId });
  } catch (err) {
    console.error('Error creating team:', err);
    return res.status(500).json({ error: 'Failed to create team.' });
  }
});

// Route to pull all teams from db
app.get('/get-teams', async (req, res) => {
  try {
    const teams = await db.collection('teams').find().toArray();
    res.json(teams);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Route to delete teams
app.post('/admin/delete-team', async (req, res) => {
  const { teamId } = req.body;

  if (!teamId) {
    return res.status(400).json({ error: 'Team ID is required.' });
  }

  try {
    // Unassign all users from the team
    await db.collection('users').updateMany(
      { team: teamId },
      { $unset: { team: "" } }
    );

    // Delete the team
    await db.collection('teams').deleteOne({ _id: new mongoose.Types.ObjectId(teamId) });

    res.status(200).json({ message: 'Team deleted successfully.' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team.' });
  }
});

// Function to start listening for audio packets on multicast
function startRTPListener({ address, port }, streamEvent) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  socket.bind(port, address, () => {
    socket.addMembership(address);
    console.log(`Listening to RTP multicast on ${address}:${port}`);
  });

  socket.on('message', (message) => {
    const audioData = message.slice(12);
    io.emit(streamEvent, audioData.toString('base64'));
  });
}

// Start listener for each multicast group
multicastGroups.forEach((group, index) => startRTPListener(group, SOCKET_EVENTS[index]));

// Start server
server.listen(HTTPS_PORT, () => console.log(`HTTPS server running on port ${HTTPS_PORT}`));


