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

// Connect to the database
let db;
connectToDatabase().then(database => {
  db = database;
});

async function validateToken(req, res, next) {
  let token = null;
  if (
    req.headers.authorization &&
    req.headers.authorization.split(" ")[0] === "Bearer"
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.hanko) {
    token = req.cookies.hanko;
  }
  if (token === null || token.length === 0) {
    res.render('login');
    return;
  }

  try {
    response = await fetch(`https://23f835c0-f746-4689-99bb-0dbd777def43.hanko.io/sessions/validate`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      method: "POST",
      body: JSON.stringify({
        session_token: token
      })
    });

    if (!response.ok) {
      let error = await response.json();
      sendError(res, error);
      return;
    }

    const session = await response.json()

    if (!session.is_valid) {
      sendToLogin(res);
      return;
    }

  } catch (error) {
    sendError(res, error)
    return;
  }

  next();
}

function sendError(res, cause) {
  let error = { message: "Invalid session token" }

  if (cause) {
    error.cause = cause;
  }

  res.status(401).send(error)
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
  //const username = req.session.user.username;

  if (!configName) {
    return res.status(400).send('Configuration name is required.');
  }

  console.log('Saving configuration:', { username, configName, configData }); // Log the data being saved

  try {
    await db.collection('configuration').updateOne(
      { username, configName },
      { $set: { configData } },
      { upsert: true }
    );
    res.status(200).send('Configuration saved.');
  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).send('Error saving configuration.');
  }
});

// Get Configurations Route
app.get('/get-configurations', validateToken, async (req, res) => {
  //const username = req.session.user.username;

  try {
    const configurations = await db.collection('configuration').find({ username }).project({ configName: 1, _id: 0 }).toArray();
    const configNames = configurations.map(config => config.configName);
    res.json(configNames);
  } catch (error) {
    console.error('Error getting configurations:', error);
    res.status(500).send('Error getting configurations.');
  }
});

// Get Specific Configuration Route
app.get('/get-configuration', validateToken, async (req, res) => {
  const username = req.session.user.username;
  const configName = req.query.name;

  try {
    const configuration = await db.collection('configuration').findOne({ username, configName });
    if (configuration) {
      res.json(configuration.configData);
    } else {
      res.status(404).send('Configuration not found.');
    }
  } catch (error) {
    console.error('Error getting configuration:', error);
    res.status(500).send('Error getting configuration.');
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