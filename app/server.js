const dgram = require('dgram');
const https = require('https');
const fs = require('fs');
const express = require('express');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const connectToDatabase = require('./db');

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

// Middleware for parsing request bodies and managing sessions
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/login');
  }
}

// Connect to the database
let db;
connectToDatabase().then(database => {
  db = database;
});

// Routes for login and signup
app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.collection('users').findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = user;
    res.redirect('/');
  } else {
    res.redirect('/login');
  }
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const existingUser = await db.collection('users').findOne({ username });
  if (existingUser) {
    res.status(400).send('Username already exists');
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({ username, password: hashedPassword });
    res.redirect('/login');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Restrict access to the root route
app.get('/', isAuthenticated, (req, res) => res.render('index'));

// Create HTTPS server and WebSocket
const server = https.createServer(options, app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Adjust this in production
    methods: ["GET", "POST"]
  }
});

// Admin Route to Start/Stop Streams
app.post('/admin/control-streams', isAuthenticated, (req, res) => {
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