// Core dependencies
const fs = require('fs');
const https = require('https');
const path = require('path');
const express = require('express');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const dotenv = require('dotenv').config();
const mongoose = require('mongoose');

// Initialize app
const app = express();
const HTTPS_PORT = 443;

// Custom modules
const connectToDatabase = require('./db');
const { validateToken } = require('./middleware/auth');

// Route modules
const teamRoutes = require('./routes/team');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const pageRoutes = require('./routes/pages');
const configRoutes = require('./routes/config');

// Utilities for stream control
const {
  multicastGroups,
  SOCKET_EVENTS,
  sendCommand,
  startRTPListener
} = require('./utils/streamControl');

// Load SSL credentials
const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
};

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add body parsing middleware
app.use(cookieParser());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Mount modular route groups
app.use('/', teamRoutes);
app.use('/', userRoutes);
app.use('/', adminRoutes);
app.use('/', pageRoutes);
app.use('/', configRoutes);

// Provide frontend config for Hanko URL
app.get('/config', (req, res) => {
  res.json({
    hankoUrl: process.env.HANKO_API_URL,
  });
});

// Connect to DB
let db;
connectToDatabase().then(database => {
  db = database;
  app.locals.db = db;
});

// Check is user is admin
function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access Denied: Admins only.' });
  }
  next();
}

// Define server
const server = https.createServer(options, app);
const io = socketIo(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || '*',
    methods: ["GET", "POST"]
  }
});

// Start listener for each multicast group
multicastGroups.forEach((group, index) => startRTPListener(group, SOCKET_EVENTS[index], io));

// Start server
server.listen(HTTPS_PORT, () => console.log(`HTTPS server running on port ${HTTPS_PORT}`));


