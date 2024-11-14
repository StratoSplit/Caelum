const dgram = require('dgram');
const http = require('http');
const express = require('express');
const socketIo = require('socket.io');
const path = require('path');
const LogInCollection = require('./db').default;
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const session = require('express-session');

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

// Configure session middleware
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to check if user is logged in
function checkAuth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

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

// Handle App POST request
app.post('/register', async (req, res) => {
  const { username, plain_password } = req.body;

  const saltRounds = 10;

  const password = await bcrypt.hash(plain_password, saltRounds);

  const data = new LogInCollection({
    username,
    password
  });

  try {
    await data.save();
    console.log("Record inserted successfully");
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send("Error inserting record");
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await LogInCollection.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.user = { username: user.username }; // Assign user session
      res.status(201).redirect('/');
    } else {
      res.status(401).send("Invalid username or password");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error during login");
  }
});

// Apply the middleware to the root route
app.get('/', checkAuth, (req, res) => {
  res.render('index', { user: req.session.user }); // Pass user session to the view
});

// Handle logout request
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error during logout");
    } else {
      res.redirect('/login');
    }
  });
});

// Start the HTTP server
server.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
});
