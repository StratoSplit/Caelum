const dgram = require('dgram');
const https = require('https');
const fs = require('fs');
const express = require('express');
const socketIo = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const connectToDatabase = require('./db');

const app = express();
const HTTPS_PORT = 443;
const UDP_TARGET = "239.0.0.11";
const UDP_PORT = 5000;

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const multicastGroups = Array.from({ length: 10 }, (_, i) => ({
  address: `239.0.0.${i + 1}`,
  port: 5001 + i * 2
}));

const SOCKET_EVENTS = multicastGroups.map((_, i) => `audio-stream-${i + 1}`);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
}));

function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/login');
  }
}

let db;
connectToDatabase().then(database => {
  db = database;
});

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
    await db.collection('users').insertOne({ username, password: hashedPassword, role: 'user', team: null });
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/', isAuthenticated, async (req, res) => {
  const user = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(req.session.user._id) });
  const team = await db.collection("teams").findOne({ _id: new mongoose.Types.ObjectId(user.team) });
  const users = await db.collection('users').find().toArray();
  const teams = await db.collection('teams').find().toArray();

  req.session.user = user;
  res.render('index', { user, team, users, teams });
});

function isAdmin(req, res, next) {
  if (req.session.user.role !== 'admin') return res.status(403).send('Access Denied');
  next();
}

app.post('/assign-role', isAdmin, async (req, res) => {
  const { userId, role } = req.body;
  await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { role } }
  );
  res.redirect('/');
});

app.post('/assign-team', isAdmin, async (req, res) => {
  const { userId, teamId } = req.body;
  await db.collection('users').updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { team: teamId } }
  );
  res.redirect('/');
});

app.post('/assign-numbers', isAdmin, async (req, res) => {
  const { teamId, numbers } = req.body;
  const channels = Object.values(numbers).map(Number);
  await db.collection('teams').updateOne(
    { _id: new mongoose.Types.ObjectId(teamId) },
    { $set: { channels } }
  );
  res.redirect('/');
});

const server = https.createServer(options, app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

function sendCommand(command, channels = [], duration = 15) {
  const client = dgram.createSocket("udp4");

  client.bind(() => {
    try {
      client.setMulticastLoopback(false);
    } catch (err) {
      console.error("Failed to disable multicast loopback:", err.message);
    }

    const message = JSON.stringify({ command, channels, duration });

    client.send(message, UDP_PORT, UDP_TARGET, (err) => {
      if (err) console.error("Error sending message:", err);
      else console.log(`[${new Date().toISOString()}] Sent: ${message}`);

      setTimeout(() => client.close(), 200);
    });
  });
}

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

multicastGroups.forEach((group, index) => startRTPListener(group, SOCKET_EVENTS[index]));

server.listen(HTTPS_PORT, () => console.log(`HTTPS server running on port ${HTTPS_PORT}`));