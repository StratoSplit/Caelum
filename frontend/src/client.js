import io from 'socket.io-client';

const audioContexts = Array.from({ length: 10 }, () => new AudioContext());
const gainNodes = audioContexts.map(ctx => ctx.createGain());
const panNodes = audioContexts.map(ctx => ctx.createStereoPanner());
const audioWorkletNodes = Array(10).fill(null);
const socket = io.connect();
const activeChannels = Array(10).fill(false); // Track active state for each channel
let mutedChannels = Array(10).fill(false); // Track mute state for each channel
let savedConfigurations = {}; // Store saved configurations
let masterVolume = 0.5; // Initial master volume

// Initialize AudioWorklet for each channel
async function initializeAudioWorklet(streamIndex) {
  if (!audioContexts[streamIndex]) return;

  try {
    await audioContexts[streamIndex].audioWorklet.addModule('/audio-processor.js');
    audioWorkletNodes[streamIndex] = new AudioWorkletNode(audioContexts[streamIndex], 'pcm-processor');
    audioWorkletNodes[streamIndex].connect(gainNodes[streamIndex]);
    gainNodes[streamIndex].connect(panNodes[streamIndex]);
    panNodes[streamIndex].connect(audioContexts[streamIndex].destination);
  } catch (error) {
    console.error(`Failed to load audio worklet module for stream ${streamIndex}:`, error);
  }
}

// Display temporary notification message
function showNotification(message) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000); // Remove after 2 seconds
}

// Adjust Master Volume and apply to all active channels
function adjustMasterVolume(value) {
  masterVolume = value;
  activeChannels.forEach((isActive, index) => {
    if (isActive && !mutedChannels[index]) {
      gainNodes[index].gain.value = masterVolume * getVolumeSliderValue(index);
    }
  });
}

// Adjust Volume for a specific channel
function adjustVolume(streamIndex, volume) {
  if (activeChannels[streamIndex] && !mutedChannels[streamIndex]) {
    gainNodes[streamIndex].gain.value = masterVolume * volume;
  }
}

// Get the volume slider value for a specific channel
function getVolumeSliderValue(streamIndex) {
  return parseFloat(document.getElementById(`volume${streamIndex + 1}`).value);
}

// Toggle Channel On/Off
function toggleChannel(channelNumber) {
  const channelIndex = channelNumber - 1;
  const toggleButton = document.getElementById(`toggleButton${channelNumber}`);
  const isActive = activeChannels[channelIndex];
  const activeChannelItem = document.getElementById(`activeChannel${channelNumber}`);

  if (isActive) {
    stopStream(channelIndex);
    toggleButton.classList.remove('on');
    toggleButton.classList.add('off');
    toggleButton.textContent = "Off";
    activeChannelItem.style.display = "none";
  } else {
    playStream(channelIndex);
    toggleButton.classList.remove('off');
    toggleButton.classList.add('on');
    toggleButton.textContent = "On";
    activeChannelItem.style.display = "block";
  }

  activeChannels[channelIndex] = !isActive;
}

// Clear Configuration: Resets all channels to their default state and stops active streams
function clearConfiguration() {
  activeChannels.forEach((isActive, index) => {
    if (isActive) {
      stopStream(index); // Explicitly stop the audio stream
      const toggleButton = document.getElementById(`toggleButton${index + 1}`);
      toggleButton.classList.remove('on');
      toggleButton.classList.add('off');
      toggleButton.textContent = "Off";
      document.getElementById(`activeChannel${index + 1}`).style.display = "none";
      activeChannels[index] = false;
      mutedChannels[index] = false;
    }

    // Reset volume and panning sliders to their middle/default values
    document.getElementById(`volume${index + 1}`).value = 0.5;
    document.getElementById(`pan${index + 1}`).value = 0;
    gainNodes[index].gain.value = masterVolume * 0.5; // Set gain to default value scaled by master volume
    panNodes[index].pan.value = 0; // Set pan directly to default
  });

  // Reset master volume to center
  document.getElementById('masterVolume').value = 0.5;
  adjustMasterVolume(0.5);

  showNotification("Configuration cleared.");
}

// Save Configuration
function saveConfiguration() {
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

  savedConfigurations[configName] = config;
  updateConfigurationDropdown();
  showNotification(`Configuration "${configName}" saved.`);
}

// Load Configuration
function loadConfiguration(configName) {
  const config = savedConfigurations[configName];
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
function updateConfigurationDropdown() {
  const dropdown = document.getElementById('configurationsDropdown');
  dropdown.innerHTML = '<option value="">Select a configuration...</option>';
  for (const configName in savedConfigurations) {
    const option = document.createElement('option');
    option.value = configName;
    option.textContent = configName;
    dropdown.appendChild(option);
  }
}

// Mute/Unmute Specific Channel
function toggleMuteChannel(channelNumber) {
  const channelIndex = channelNumber - 1;
  const muteButton = document.querySelector(`#activeChannel${channelNumber} .mute-btn`);
  const isMuted = mutedChannels[channelIndex];

  if (isMuted) {
    // Restore volume as a function of master volume and channel volume
    gainNodes[channelIndex].gain.value = masterVolume * getVolumeSliderValue(channelIndex);
    muteButton.textContent = "Mute";
    muteButton.classList.remove("muted");
  } else {
    gainNodes[channelIndex].gain.value = 0; // Mute the channel by setting gain to 0
    muteButton.textContent = "Unmute";
    muteButton.classList.add("muted");
  }

  mutedChannels[channelIndex] = !isMuted; // Toggle mute state
}

// Mute All Active Channels
function muteAll() {
  activeChannels.forEach((isActive, index) => {
    if (isActive && !mutedChannels[index]) {
      gainNodes[index].gain.value = 0; // Mute channel by setting gain to 0
      const muteButton = document.querySelector(`#activeChannel${index + 1} .mute-btn`);
      muteButton.textContent = "Unmute";
      muteButton.classList.add("muted");
      mutedChannels[index] = true;
    }
  });
}

// Unmute All Active Channels
function cancelMute() {
  activeChannels.forEach((isActive, index) => {
    if (isActive && mutedChannels[index]) {
      // Restore volume as a function of master volume and channel volume
      gainNodes[index].gain.value = masterVolume * getVolumeSliderValue(index);
      const muteButton = document.querySelector(`#activeChannel${index + 1} .mute-btn`);
      muteButton.textContent = "Mute";
      muteButton.classList.remove("muted");
      mutedChannels[index] = false;
    }
  });
}

// Helper function to play a stream, initializing if needed
function playStream(streamIndex) {
  const audioContext = audioContexts[streamIndex];
  if (audioContext.state === 'suspended') audioContext.resume();
  if (!audioWorkletNodes[streamIndex]) initializeAudioWorklet(streamIndex);

  const channelVolume = getVolumeSliderValue(streamIndex);
  gainNodes[streamIndex].gain.value = masterVolume * channelVolume;
  panNodes[streamIndex].pan.value = getPanningSliderValue(streamIndex);
}

// Helper function to stop a stream by disconnecting audio nodes
function stopStream(streamIndex) {
  if (audioWorkletNodes[streamIndex]) {
    audioWorkletNodes[streamIndex].disconnect();
    audioWorkletNodes[streamIndex] = null; // Remove the worklet node to fully stop audio
  }
}

// Adjust panning for a specific channel
function adjustPanning(streamIndex, panValue) {
  panNodes[streamIndex].pan.value = panValue;
}

// Get the panning slider value for a specific channel
function getPanningSliderValue(streamIndex) {
  return parseFloat(document.getElementById(`pan${streamIndex + 1}`).value);
}

// WebSocket listeners for each audio stream
const events = [
  'audio-stream-1', 'audio-stream-2', 'audio-stream-3', 'audio-stream-4', 'audio-stream-5',
  'audio-stream-6', 'audio-stream-7', 'audio-stream-8', 'audio-stream-9', 'audio-stream-10'
];

events.forEach((event, index) => {
  socket.on(event, (data) => {
    const audioData = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const pcmData = new Float32Array(audioData.length / 2);
    const dataView = new DataView(audioData.buffer);

    for (let i = 0; i < pcmData.length; i++) {
      pcmData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    if (audioWorkletNodes[index]) {
      audioWorkletNodes[index].port.postMessage(pcmData);
    }
  });
});

export {
  muteAll,
  cancelMute,
  clearConfiguration,
  adjustMasterVolume,
  adjustVolume,
  adjustPanning,
  toggleChannel,
  toggleMuteChannel,
  saveConfiguration,
  loadConfiguration,
  updateConfigurationDropdown
};