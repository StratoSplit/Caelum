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


const app = express();
const HTTPS_PORT = 443; // HTTPS standard port
const UDP_TARGET = "239.0.0.11";
const UDP_PORT = 5000;

// Load SSL certificate and key
const options = {
  key: fs.readFileSync('key.pem'), // Your private key
  cert: fs.readFileSync('cert.pem') // Your certificate
};

// Define multicast addresses and ports for RTP streams
const multicastGroups = [
  { address: "239.0.0.1", port: 5001 },
  { address: "239.0.0.2", port: 5003 },
  { address: "239.0.0.3", port: 5005 },
  { address: "239.0.0.4", port: 5007 },
  { address: "239.0.0.5", port: 5009 },
  { address: "239.0.0.6", port: 5011 },
  { address: "239.0.0.7", port: 5013 },
  { address: "239.0.0.8", port: 5015 },
  { address: "239.0.0.9", port: 5017 },
  { address: "239.0.0.10", port: 5019 }
];
const SOCKET_EVENTS = [
  'audio-stream-1', 'audio-stream-2', 'audio-stream-3', 'audio-stream-4', 'audio-stream-5',
  'audio-stream-6', 'audio-stream-7', 'audio-stream-8', 'audio-stream-9', 'audio-stream-10'
];

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

// Connect to the database
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
    const response = await fetch('https://f7dbbf71-7f94-4302-854e-f55872f176b7.hanko.io/sessions/validate', {
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

function sendToLogin(res) {
  res.render('login');
}



// Routes for login and signup
app.get('/login', (req, res) => res.render('login'));
app.get('/profile', validateToken, (req, res) => res.render('profile'));

// Restrict access to the root route
app.get('/', validateToken, (req, res) => res.render('index'));

// Save Configuration Route
app.post('/save-configuration', validateToken, async (req, res) => {
  const { configName, configData } = req.body;
  const userId = req.user.userId;

  if (!configName || !configData) {
    return res.status(400).json({ error: 'Configuration name and data are required.' });
  }

  try {
    await db.collection('configurations').updateOne(
      { userId, configName },
      {
        $set: {
          configData,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('Configuration saved:', { userId, configName });
    res.status(200).json({ message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Save configuration error:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
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

// Create HTTPS server and WebSocket
const server = https.createServer(options, app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust this in production
    methods: ["GET", "POST"]
  }
});

// Admin Route to Start/Stop Streams
app.post('/admin/control-streams', validateToken, async (req, res) => {
  const { action } = req.body;
  console.log(req.body);
  if (!["start", "stop"].includes(action)) {
    return res.status(400).json({ message: "Invalid action." });
  }

  const message = Buffer.from(action);
  const client = dgram.createSocket('udp4');

  client.send(message, 0, message.length, UDP_PORT, UDP_TARGET, (err) => {
    client.close();
    if (err) {
      console.error("UDP send error:", err);
      return res.status(500).json({ message: "Failed to send command." });
    }
  });
});

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).render('404');
});

// Function to start listening to an RTP stream and forward it over WebSocket
function startRTPListener({ address, port }, streamEvent) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  // Bind to the multicast address and port
  socket.bind(port, address, () => {
    socket.addMembership(address);
    console.log(`Listening to RTP multicast on ${address}:${port}`);
  });

  // Process incoming RTP packets and extract the payload
  socket.on('message', (message) => {
    const rtpHeaderSize = 12; // RTP header size is typically 12 bytes
    if (message.length > rtpHeaderSize) {
      const audioData = message.slice(rtpHeaderSize);
      io.emit(streamEvent, audioData.toString('base64'));
    }
  });

  socket.on('error', (err) => {
    console.error(`UDP server error on ${address}:${port}:`, err);
  });
}

// Start an RTP listener for each multicast group
multicastGroups.forEach((group, index) => {
  startRTPListener(group, SOCKET_EVENTS[index]);
});

// Start the HTTPS server
server.listen(HTTPS_PORT, () => {
  console.log(`HTTPS server running on port ${HTTPS_PORT}`);
});