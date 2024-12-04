const dgram = require('dgram');
const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const connectToDatabase = require('./db'); // Import the database connection

const app = express();
const HTTP_PORT = 8000;

// Define multicast addresses and ports for each RTP stream
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
  const user = await db.collection('users').findOne({ username, password }); // Fetch user from the database
  if (user) {
    req.session.user = user;
    res.redirect('/');
  } else {
    res.redirect('/login');
  }
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  await db.collection('users').insertOne({ username, password }); // Create user in the database
  res.redirect('/login');
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Restrict access to the root route
app.get('/', isAuthenticated, (req, res) => res.render('index'));

// Create HTTP server and WebSocket
const server = http.createServer(app);
const io = socketIo(server);

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
      const audioData = message.slice(rtpHeaderSize); // Extract audio payload
      io.emit(streamEvent, audioData.toString('base64')); // Send Base64-encoded payload
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

// Start the HTTP server
server.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
});
