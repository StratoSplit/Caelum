const dgram = require('dgram');
const http = require('http');
const express = require('express');
const cors = require('cors');
const socketIo = require('socket.io');
const OperatorModel = require('./Models/Operator');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();
const uri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

if (!uri) {
  console.error("MONGODB_URI is not defined in the environment variables.");
  process.exit(1);
}

mongoose.connect(uri)
.then(() => {
  console.log("Connected to the database!");
  })
.catch((err) => {
  console.log("Cannot connect to the database!", err);
  process.exit();
})

const app = express();
const HTTP_PORT = 8000;

app.use(cors());
app.use(express.json());

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

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.post("/register", (req, res) => {
  const { username, email, password } = req.body;
  
  OperatorModel.findOne({ $or: [{ username: username }, { email: email }] })
    .then(existingOperator => {
      if (existingOperator) {
        return res.status(400).json({ message: "Username or email already exists" });
      }
      
      bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
          return res.status(500).json(err);
        }
        OperatorModel.create({ username, email, password: hashedPassword })
          .then(operator => res.json(operator))
          .catch(err => res.status(400).json(err));
      });
    })
    .catch(err => res.status(500).json(err));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`Login attempt for username: ${username}`);
  
  OperatorModel.findOne({ username: username })
    .then(operator => {
      if (!operator) {
        console.log(`No operator found for username: ${username}`);
        return res.json("Failure");
      }
      bcrypt.compare(password, operator.password, (err, result) => {
        if (err) {
          return res.status(500).json(err);
        }
        if (result) {
          console.log(`Login successful for username: ${username}`);
          const token = jwt.sign({ username: operator.username }, JWT_SECRET, { expiresIn: '1h' });
          res.json({ message: "Success", token });
        } else {
          console.log(`Incorrect password for username: ${username}`);
          res.json("Failure");
        }
      });
    })
    .catch(err => {
      console.error(`Error during login for username: ${username}`, err);
      res.status(500).json(err);
    });
});

// Protect the audio configuration route
app.get("/", authenticateToken, (req, res) => {
  res.json({ message: "Welcome to the audio configuration dashboard!" });
});

// Start the HTTP server
server.listen(HTTP_PORT, () => {
  console.log(`HTTP server listening on port ${HTTP_PORT}`);
});
