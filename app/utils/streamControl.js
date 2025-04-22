const dgram = require('dgram');

// Define multicast stream groups
const multicastGroups = Array.from({ length: 10 }, (_, i) => ({
  address: `239.0.0.${i + 1}`,
  port: 5001 + i * 2,
}));

// Corresponding socket.io events
const SOCKET_EVENTS = multicastGroups.map((_, i) => `audio-stream-${i + 1}`);

// Send UDP command to audio generator
function sendCommand(command, channels = [], duration = 15, target = "239.0.0.11", port = 5000) {
  const client = dgram.createSocket("udp4");

  client.bind(() => {
    try {
      client.setMulticastLoopback(false);
    } catch (err) {
      console.error("Failed to disable multicast loopback:", err.message);
    }

    const message = JSON.stringify({ command, channels, duration });

    client.send(message, port, target, (err) => {
      if (err) console.error("Error sending message:", err);
      else console.log(`[${new Date().toISOString()}] Sent: ${message}`);
      setTimeout(() => client.close(), 200);
    });
  });
}

// Start UDP listener for incoming audio
function startRTPListener({ address, port }, streamEvent, io) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  socket.bind(port, address, () => {
    socket.addMembership(address);
    console.log(`Listening to RTP multicast on ${address}:${port}`);
  });

  socket.on('message', (message) => {
    const audioData = message.slice(12); // Skip RTP header
    io.emit(streamEvent, audioData.toString('base64'));
  });
}

module.exports = {
  multicastGroups,
  SOCKET_EVENTS,
  sendCommand,
  startRTPListener,
};

