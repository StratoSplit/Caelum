const audioContexts = Array.from({ length: 10 }, () => new AudioContext());
const gainNodes = audioContexts.map(ctx => ctx.createGain());
const panNodes = audioContexts.map(ctx => ctx.createStereoPanner());
const audioWorkletNodes = Array(10).fill(null);

// Socket.io connection
const socket = io.connect();

// Track active state, mute state, saved configs, etc.
const activeChannels = Array(10).fill(false); 
let mutedChannels = Array(10).fill(false); 
let savedConfigurations = {}; 
let masterVolume = 0.5; 

// Timers to remove the traffic highlight after inactivity
let flashTimers = {};
let channelInactivityTimers = {};

// Initialize the AudioWorklet for a specific channel (index).
async function initializeAudioWorklet(streamIndex) {
  if (!audioContexts[streamIndex]) return;
  await audioContexts[streamIndex].audioWorklet.addModule('/audio-processor.js');
  
  audioWorkletNodes[streamIndex] = new AudioWorkletNode(
    audioContexts[streamIndex], 
    'pcm-processor'
  );
  
  audioWorkletNodes[streamIndex].connect(gainNodes[streamIndex]);
  gainNodes[streamIndex].connect(panNodes[streamIndex]);
  panNodes[streamIndex].connect(audioContexts[streamIndex].destination);
}

// Toggle the admin panel visibility with an overlay.
function toggleAdminPanel() {
  const panel = document.getElementById("adminPanel");
  const body = document.body;

  if (panel.style.display === "none" || panel.style.display === "") {
    panel.style.display = "block";
    body.classList.add("overlay-active"); // Dark background
  } else {
    panel.style.display = "none";
    body.classList.remove("overlay-active");
  }
}

// Close the admin panel when clicking outside of it.
document.addEventListener("click", function (event) {
  const panel = document.getElementById("adminPanel");
  if (
    panel.style.display === "block" &&
    !panel.contains(event.target) &&
    event.target.id !== "adminButton"
  ) {
    toggleAdminPanel();
  }
});

// Send start/stop commands to the server for RTP streams.
function sendAdminCommand() {
  const action = document.getElementById("adminAction").value;
  fetch("/admin/control-streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  })
    .then(response => response.json())
    .then(data => alert(data.message))
    .catch(err => console.error("Error sending command:", err));
}

// Show a temporary notification message on-screen.
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000); // Remove after 2 seconds
}

// Adjust the master volume and apply it to all active, unmuted channels.
function adjustMasterVolume(value) {
  masterVolume = value;
  activeChannels.forEach((isActive, index) => {
    if (isActive && !mutedChannels[index]) {
      gainNodes[index].gain.value = masterVolume * getVolumeSliderValue(index);
    }
  });
}

// Adjust volume for a specific channel, if active and unmuted.
function adjustVolume(streamIndex, volume) {
  if (activeChannels[streamIndex] && !mutedChannels[streamIndex]) {
    gainNodes[streamIndex].gain.value = masterVolume * volume;
  }
}


// Get the volume slider value for a specific channel (index).
function getVolumeSliderValue(streamIndex) {
  return parseFloat(document.getElementById(`volume${streamIndex + 1}`).value);
}

// Toggle a channel ON or OFF.
function toggleChannel(channelNumber) {
  const channelIndex = channelNumber - 1;
  const toggleButton = document.getElementById(`toggleButton${channelNumber}`);
  const activeChannelItem = document.getElementById(`activeChannel${channelNumber}`);
  const isActive = activeChannels[channelIndex];

  if (isActive) {
    // Currently ON -> Turn it OFF
    stopStream(channelIndex);
    toggleButton.classList.remove("on", "traffic");
    toggleButton.classList.add("off");
    toggleButton.textContent = "Off";
    activeChannelItem.style.display = "none";
  } else {
    // Currently OFF -> Turn it ON
    playStream(channelIndex);
    toggleButton.classList.remove("off", "traffic");
    toggleButton.classList.add("on");
    toggleButton.textContent = "On";
    activeChannelItem.style.display = "block";
  }

  activeChannels[channelIndex] = !isActive;
}

/*
  Clear the configuration: reset all channels (OFF), volumes/pans to default,
  master volume to 0.5, etc.
 */
function clearConfiguration() {
  activeChannels.forEach((isActive, index) => {
    if (isActive) {
      // Stop the audio stream
      stopStream(index);
      const toggleButton = document.getElementById(`toggleButton${index + 1}`);
      toggleButton.classList.remove("on", "traffic");
      toggleButton.classList.add("off");
      toggleButton.textContent = "Off";
      document.getElementById(`activeChannel${index + 1}`).style.display = "none";
      activeChannels[index] = false;
      mutedChannels[index] = false;
    }

    // Reset volume/pan sliders to default
    document.getElementById(`volume${index + 1}`).value = 0.5;
    document.getElementById(`pan${index + 1}`).value = 0;
    gainNodes[index].gain.value = masterVolume * 0.5;
    panNodes[index].pan.value = 0;
  });

  // Reset master volume
  document.getElementById('masterVolume').value = 0.5;
  adjustMasterVolume(0.5);

  showNotification("Configuration cleared.");
}

// Save Configuration
async function saveConfiguration() {
  const configName = document.getElementById('configName').value.trim();
  if (!configName) {
    showNotification("Please enter a configuration name.");
    return;
  }

  const config = {
    activeChannels: [...activeChannels],
    volumes: activeChannels.map((isActive, index) =>
      isActive ? getVolumeSliderValue(index) : 0
    ),
    pannings: activeChannels.map((isActive, index) =>
      isActive ? getPanningSliderValue(index) : 0
    ),
  };

  console.log('Saving configuration:', { configName, configData: config }); // Log the data being sent

  try {
    const response = await fetch('/save-configuration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ configName, configData: config })
    });

    if (response.ok) {
      showNotification(`Configuration "${configName}" saved to server.`);
      await updateConfigurationDropdown();
    } else {
      showNotification("Failed to save configuration to server.");
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showNotification("Error saving configuration to server.");
  }
}

// Load Configuration
function loadConfiguration(configName, config) {
  if (!config) return;

  clearConfiguration(); // Clear current state before loading new config

  config.activeChannels.forEach((isActive, index) => {
    if (isActive) {
      toggleChannel(index + 1); // Activate channel if it was active in saved config
      document.getElementById(`volume${index + 1}`).value = config.volumes[index];
      adjustVolume(index, config.volumes[index]);
      document.getElementById(`pan${index + 1}`).value = config.pannings[index];
      adjustPanning(index, config.pannings[index]);
    }
  });

  showNotification(`Configuration "${configName}" loaded.`);
}

// Update Configuration Dropdown
async function updateConfigurationDropdown() {
  const dropdown = document.getElementById('configurationsDropdown');
  dropdown.innerHTML = '<option value="">Select a configuration...</option>';

  try {
    const response = await fetch('/get-configurations');
    if (response.ok) {
      const configurations = await response.json();
      configurations.forEach(configName => {
        const option = document.createElement('option');
        option.value = configName;
        option.textContent = configName;
        dropdown.appendChild(option);
      });
    } else {
      showNotification("Failed to load configurations from server.");
    }
  } catch (error) {
    console.error('Error loading configurations:', error);
    showNotification("Error loading configurations from server.");
  }
}

// Mute/Unmute a specific channel.
function toggleMuteChannel(channelNumber) {
  const channelIndex = channelNumber - 1;
  const muteButton = document.querySelector(`#activeChannel${channelNumber} .mute-btn`);
  const isMuted = mutedChannels[channelIndex];

  if (isMuted) {
    // Restore volume
    gainNodes[channelIndex].gain.value = masterVolume * getVolumeSliderValue(channelIndex);
    muteButton.textContent = "Mute";
    muteButton.classList.remove("muted");
  } else {
    // Mute channel
    gainNodes[channelIndex].gain.value = 0;
    muteButton.textContent = "Unmute";
    muteButton.classList.add("muted");
  }

  mutedChannels[channelIndex] = !isMuted;
}

// Mute all active channels.
function muteAll() {
  activeChannels.forEach((isActive, index) => {
    if (isActive && !mutedChannels[index]) {
      gainNodes[index].gain.value = 0;
      const muteButton = document.querySelector(`#activeChannel${index + 1} .mute-btn`);
      muteButton.textContent = "Unmute";
      muteButton.classList.add("muted");
      mutedChannels[index] = true;
    }
  });
}

// Unmute all active channels.
function cancelMute() {
  activeChannels.forEach((isActive, index) => {
    if (isActive && mutedChannels[index]) {
      gainNodes[index].gain.value = masterVolume * getVolumeSliderValue(index);
      const muteButton = document.querySelector(`#activeChannel${index + 1} .mute-btn`);
      muteButton.textContent = "Mute";
      muteButton.classList.remove("muted");
      mutedChannels[index] = false;
    }
  });
}

// Start streaming on a channel if not already.
function playStream(streamIndex) {
  const audioContext = audioContexts[streamIndex];
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  if (!audioWorkletNodes[streamIndex]) {
    initializeAudioWorklet(streamIndex);
  }

  const channelVolume = getVolumeSliderValue(streamIndex);
  gainNodes[streamIndex].gain.value = masterVolume * channelVolume;
  panNodes[streamIndex].pan.value = getPanningSliderValue(streamIndex);
}

function stopClientChannel(channelIndex) {
  stopStream(channelIndex);

  const button = document.getElementById(`toggleButton${channelIndex + 1}`);
  button.classList.remove("on", "traffic");
  button.classList.add("off");
  button.textContent = "Off";

  const activeChannelItem = document.getElementById(`activeChannel${channelIndex + 1}`);
  activeChannelItem.style.display = "none";

  activeChannels[channelIndex] = false;
  mutedChannels[channelIndex] = false;
}

// Stop streaming on a channel (disconnect audio nodes).
function stopStream(streamIndex) {
  if (audioWorkletNodes[streamIndex]) {
    audioWorkletNodes[streamIndex].disconnect();
    audioWorkletNodes[streamIndex] = null;
  }
  gainNodes[streamIndex].gain.value = 0;
}

// Adjust panning for a specific channel.
function adjustPanning(streamIndex, panValue) {
  panNodes[streamIndex].pan.value = panValue;
}

// Get the panning slider value for a specific channel.
function getPanningSliderValue(streamIndex) {
  return parseFloat(document.getElementById(`pan${streamIndex + 1}`).value);
}

// WebSocket listeners for each of the 10 audio streams.
const events = [
  'audio-stream-1', 'audio-stream-2', 'audio-stream-3', 'audio-stream-4', 'audio-stream-5',
  'audio-stream-6', 'audio-stream-7', 'audio-stream-8', 'audio-stream-9', 'audio-stream-10'
];

events.forEach((event, index) => {
  socket.on(event, (data) => {
    const audioData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const pcmData = new Float32Array(audioData.length / 2);
    const dataView = new DataView(audioData.buffer);

    // Convert 16-bit PCM to Float32
    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    // Send PCM to the AudioWorklet if channel is ON
    if (audioWorkletNodes[index]) {
      audioWorkletNodes[index].port.postMessage(pcmData);
    }

    // If channel is OFF, highlight it in yellow for 1 second
    highlightTraffic(index + 1);

    clearTimeout(channelInactivityTimers[index]);
    channelInactivityTimers[index] = setTimeout(() => {
      // If this fires, it means we got no packets for X ms
      // => forcibly stop the stream on the client
      if (activeChannels[index]) {
        console.log(`No packets on channel ${index + 1} for 50ms. Stopping stream...`);
        stopClientChannel(index);
      }
    }, 50); // .05 seconds of inactivity => stop
  });
});

// Highlight an OFF channel in yellow if it receives RTP traffic.
function highlightTraffic(channelNumber) {
  const button = document.getElementById(`toggleButton${channelNumber}`);
  if (!button || button.classList.contains("on")) return; // Only highlight if OFF

  // Turn it yellow
  button.classList.add("traffic");

  // Remove yellow after 1 second if no new packets arrive
  clearTimeout(flashTimers[channelNumber]);
  flashTimers[channelNumber] = setTimeout(() => {
    button.classList.remove("traffic");
  }, 1000);
}
