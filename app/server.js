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
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

// Add this helper function after the requires
function getCurrentOTP(secret) {
    return speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        step: 30,
        digits: 6,
        window: 1
    });
}

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
  const { username, password, otpCode } = req.body;
  const user = await db.collection('users').findOne({ username });
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).send('Invalid username, password, or OTP code');
  }
  
  // Verify OTP with standard settings
  const verified = speakeasy.totp.verify({
    secret: user.otpSecret,
    encoding: 'base32',
    token: otpCode,
    step: 30,
    digits: 6,
    window: 1
  });
  
  if (!verified) {
    return res.status(401).send('Invalid username, password, or OTP code');
  }
  
  req.session.user = user;
  res.status(200).end();
});

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Registration attempt for:', username);

        if (!username || !password) {
            return res.status(400).send('Username and password are required');
        }

        // Check for existing user
        const existingUser = await db.collection('users').findOne({ username });
        if (existingUser) {
            return res.status(400).send('Username already exists. Please choose a different username.');
        }

        // Generate OTP secret with standard settings
        const secret = speakeasy.generateSecret({
            name: encodeURIComponent(`Caelum (${username})`),
            issuer: 'Caelum',
            length: 20
        });

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        const currentOTP = getCurrentOTP(secret.base32);

        console.log('Generated OTP secret for:', username);
        console.log('Current OTP for debug:', currentOTP);
        console.log('OTP URL:', secret.otpauth_url); // Debug log

        // Instead of creating the user here, render the OTP setup page
        return res.render('otp-setup', {
            qrCodeUrl,
            tempSecret: secret.base32,
            username,
            password,
            currentOTP,
            error: null
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).send('An error occurred during registration');
    }
});

// Add OTP verification endpoint
app.post('/verify-otp', async (req, res) => {
  const { username, password, otpCode, tempSecret } = req.body;
  
  // Verify OTP code with standard settings
  const verified = speakeasy.totp.verify({
    secret: tempSecret,
    encoding: 'base32',
    token: otpCode,
    step: 30,
    digits: 6,
    window: 1  // Allow 1 step before/after for time drift
  });
  
  if (!verified) {
    const currentOTP = getCurrentOTP(tempSecret);
    const secret = { 
        base32: tempSecret, 
        otpauth_url: `otpauth://totp/Caelum:${encodeURIComponent(username)}?secret=${tempSecret}&issuer=Caelum&digits=6&period=30` 
    };
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    return res.render('otp-setup', {
      qrCodeUrl,
      tempSecret,
      username,
      password,
      currentOTP,
      error: 'Invalid authentication code. Please try again.'
    });
  }
  
  // Create user with OTP secret
  const hashedPassword = await bcrypt.hash(password, 10);
  await db.collection('users').insertOne({
    username,
    password: hashedPassword,
    otpSecret: tempSecret
  });
  
  res.redirect('/login');
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Restrict access to the root route
app.get('/', isAuthenticated, (req, res) => res.render('index'));

// Save Configuration Route
app.post('/save-configuration', isAuthenticated, async (req, res) => {
  const { configName, configData } = req.body;
  const username = req.session.user.username;

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
app.get('/get-configurations', isAuthenticated, async (req, res) => {
  const username = req.session.user.username;

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
app.get('/get-configuration', isAuthenticated, async (req, res) => {
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