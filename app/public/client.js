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
  const duration = parseInt(document.getElementById("streamDuration").value) || 15;
  const selectedChannels = [...document.querySelectorAll("input[name='channels']:checked")]
    .map(cb => parseInt(cb.value));

  if (action === "start" && selectedChannels.length === 0) {
    showNotification("Please select at least one channel");
    return;
  }

  fetch("/admin/control-streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      action, 
      channels: selectedChannels,
      duration 
    })
  })
    .then(response => response.json())
    .then(data => {
      showNotification(data.message);
    })
    .catch(err => {
      console.error("Error sending command:", err);
      showNotification("Error sending command to server");
    });
}

// Show a temporary notification message on-screen.
function showNotification(message, isSuccess = true) {
  const notification = document.createElement("div");
  notification.className = isSuccess ? "notification success" : "notification error";
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Remove the notification after a delay
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
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
  try {
    const channelIndex = channelNumber - 1;
    const toggleButton = document.getElementById(`toggleButton${channelNumber}`);
    const activeChannelItem = document.getElementById(`activeChannel${channelNumber}`);
    
    if (!toggleButton) {
      console.warn(`Toggle button for channel ${channelNumber} not found`);
      return;
    }
    
    if (!activeChannelItem) {
      console.warn(`Active channel item for channel ${channelNumber} not found`);
      return;
    }
    
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
  } catch (error) {
    console.error(`Error in toggleChannel(${channelNumber}):`, error);
  }
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
      if (toggleButton) {
        toggleButton.classList.remove("on", "traffic");
        toggleButton.classList.add("off");
        toggleButton.textContent = "Off";
      }

      const activeChannelItem = document.getElementById(`activeChannel${index + 1}`);
      if (activeChannelItem) {
        activeChannelItem.style.display = "none";
      }

      activeChannels[index] = false;
      mutedChannels[index] = false;
    }

    // Reset volume/pan sliders to default
    const volumeSlider = document.getElementById(`volume${index + 1}`);
    if (volumeSlider) {
      volumeSlider.value = 0.5;
    } else {
      console.warn(`Volume slider for channel ${index + 1} not found.`);
    }

    const panSlider = document.getElementById(`pan${index + 1}`);
    if (panSlider) {
      panSlider.value = 0;
    } else {
      console.warn(`Panning slider for channel ${index + 1} not found.`);
    }

    gainNodes[index].gain.value = masterVolume * 0.5;
    panNodes[index].pan.value = 0;
  });

  // Reset master volume
  const masterVolumeControl = document.getElementById('masterVolume');
  if (masterVolumeControl) {
    masterVolumeControl.value = 0.5;
  } else {
    console.warn('Master volume control not found.');
  }
  adjustMasterVolume(0.5);

  showNotification("Configuration cleared.");
}

// Save Configuration
async function saveConfiguration() {
  const configName = document.getElementById('configName').value.trim();
  if (!configName) {
    showNotification('Please enter a configuration name', false);
    return;
  }

  // Create a configuration object with the current state
  const config = {
    masterVolume: parseFloat(document.getElementById('masterVolume').value),
    channels: []
  };

  // Collect data for each channel
  for (let i = 0; i < 10; i++) {
    const volumeElement = document.getElementById(`volume${i + 1}`);
    const panElement = document.getElementById(`pan${i + 1}`);
    
    if (!volumeElement || !panElement) continue;

    config.channels.push({
      channelNumber: i + 1,
      isActive: activeChannels[i],
      volume: parseFloat(volumeElement.value) || 0.5,
      pan: parseFloat(panElement.value) || 0,
      isMuted: mutedChannels[i]
    });
  }

  console.log('Saving configuration:', configName, JSON.stringify(config));

  try {
    const response = await fetch('/save-configuration', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        configName,
        configData: config
      })
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      throw new Error(responseData.error || 'Failed to save configuration');
    }

    console.log('Save response:', responseData);
    
    // Save locally for immediate use
    savedConfigurations[configName] = config;
    
    // Update the dropdown with the new configuration
    await updateConfigurationDropdown();
    
    // Add a save confirmation message below the configuration section
    addConfigSavedMessage(configName);
    
    // Also show a notification
    showNotification(`Configuration "${configName}" saved successfully`);
  } catch (error) {
    console.error('Save configuration error:', error);
    showNotification('Error: ' + error.message, false);
  }
}

// Add a simple message below the configuration section
function addConfigSavedMessage(configName) {
  // Look for an existing message to update or remove
  let savedMsg = document.getElementById('config-saved-message');
  
  if (!savedMsg) {
    // Create a new message element
    savedMsg = document.createElement('div');
    savedMsg.id = 'config-saved-message';
    savedMsg.className = 'config-saved-message';
    
    // Find the config section to append after
    const configSection = document.querySelector('.config-section.boxed');
    if (configSection) {
      configSection.appendChild(savedMsg);
    } else {
      // Fallback to append to body if config section not found
      document.body.appendChild(savedMsg);
    }
  }
  
  // Update the message text
  savedMsg.textContent = `Configuration "${configName}" saved successfully!`;
  
  // Auto-remove after some time
  setTimeout(() => {
    if (savedMsg && savedMsg.parentNode) {
      savedMsg.classList.add('fade-out');
      setTimeout(() => {
        if (savedMsg && savedMsg.parentNode) {
          savedMsg.parentNode.removeChild(savedMsg);
        }
      }, 500);
    }
  }, 5000);
}

// Load Configuration
async function loadConfiguration(configName) {
  if (!configName) return;
  
  try {
    // Reset any previous error state
    const dropdown = document.getElementById('configurationsDropdown');
    if (dropdown) dropdown.classList.remove('error');
    
    // Check if we already have it in memory
    if (savedConfigurations[configName]) {
      console.log('Loading configuration from memory:', configName);
      applyConfiguration(configName, savedConfigurations[configName]);
      return;
    }
    
    // Otherwise fetch from server
    console.log('Fetching configuration from server:', configName);
    
    // Use a try-catch block specifically for the fetch operation
    try {
      const response = await fetch(`/get-configuration?name=${encodeURIComponent(configName)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server returned ${response.status}`);
      }
      
      const config = await response.json();
      
      if (!config) {
        throw new Error('Empty configuration received from server');
      }
      
      console.log('Loaded configuration from server:', config);
      
      // Cache for future use
      savedConfigurations[configName] = config;
      
      // Apply the configuration
      applyConfiguration(configName, config);
    } catch (fetchError) {
      console.error('Error fetching configuration:', fetchError);
      throw new Error(`Failed to load configuration from server: ${fetchError.message}`);
    }
  } catch (error) {
    console.error('Error loading configuration:', error);
    showNotification('Error loading configuration: ' + error.message, false);
    
    // Mark dropdown as error state
    const dropdown = document.getElementById('configurationsDropdown');
    if (dropdown) {
      dropdown.classList.add('error');
      dropdown.value = '';
    }
  }
}

// Function to apply a configuration to the UI
function applyConfiguration(configName, config) {
  try {
    // Clear current state
    clearConfiguration();
    
    console.log('Applying configuration:', configName);

    // Set master volume if control exists
    const masterVolumeControl = document.getElementById('masterVolume');
    if (masterVolumeControl && config.masterVolume !== undefined) {
      console.log('Setting master volume:', config.masterVolume);
      masterVolumeControl.value = config.masterVolume;
      adjustMasterVolume(config.masterVolume);
    } else {
      console.warn('Master volume control not found or undefined in configuration.');
    }

    // Load channel configurations if present and valid
    if (config.channels && Array.isArray(config.channels)) {
      config.channels.forEach((channel, idx) => {
        try {
          // The UI is 1-indexed but arrays are 0-indexed
          const channelNumber = channel.channelNumber || (idx + 1);
          const channelIndex = channelNumber - 1;
          
          console.log(`Processing channel ${channelNumber} (isActive: ${channel.isActive})`);
          
          // Skip inactive channels
          if (!channel.isActive) return;
          
          // Skip out-of-range channels
          if (channelIndex < 0 || channelIndex >= 10) {
            console.warn(`Channel index out of range: ${channelIndex}`);
            return;
          }
          
          // Check if the UI elements exist for this channel
          const toggleButton = document.getElementById(`toggleButton${channelNumber}`);
          const volumeSlider = document.getElementById(`volume${channelNumber}`);
          const panSlider = document.getElementById(`pan${channelNumber}`);
          const muteButton = document.querySelector(`#activeChannel${channelNumber} .mute-btn`);

          if (!toggleButton) {
            console.warn(`Toggle button for channel ${channelNumber} not found.`);
            return;
          }

          if (!volumeSlider) {
            console.warn(`Volume slider for channel ${channelNumber} not found.`);
          }

          if (!panSlider) {
            console.warn(`Panning slider for channel ${channelNumber} not found.`);
          }

          console.log(`Activating channel ${channelNumber}`);
          
          // Activate the channel if it's not already active
          if (!activeChannels[channelIndex]) {
            toggleChannel(channelNumber);
          }
          
          // Set volume if the slider exists
          if (volumeSlider && channel.volume !== undefined) {
            console.log(`Setting volume for channel ${channelNumber}:`, channel.volume);
            volumeSlider.value = channel.volume;
            adjustVolume(channelIndex, channel.volume);
          }

          // Set panning if the slider exists
          if (panSlider && channel.pan !== undefined) {
            console.log(`Setting panning for channel ${channelNumber}:`, channel.pan);
            panSlider.value = channel.pan;
            adjustPanning(channelIndex, channel.pan);
          }

          // Set mute state if needed
          if (muteButton) {
            if (channel.isMuted && !mutedChannels[channelIndex]) {
              console.log(`Muting channel ${channelNumber}`);
              toggleMuteChannel(channelNumber);
            } else if (!channel.isMuted && mutedChannels[channelIndex]) {
              console.log(`Unmuting channel ${channelNumber}`);
              toggleMuteChannel(channelNumber);
            }
          }
        } catch (channelError) {
          console.error(`Error setting up channel ${idx + 1}:`, channelError);
        }
      });
    } else {
      console.warn('No valid channels found in configuration.');
    }

    showNotification(`Configuration "${configName}" loaded`);
  } catch (error) {
    console.error('Error applying configuration:', error);
    showNotification(`Error applying configuration: ${error.message}`, false);
  }
}

// Update Configuration Dropdown
async function updateConfigurationDropdown() {
  const dropdown = document.getElementById('configurationsDropdown');
  if (!dropdown) return;
  
  // Clear the dropdown
  dropdown.innerHTML = '<option value="">Select a configuration...</option>';
  
  try {
    // Get configurations from server
    const response = await fetch('/get-configurations');
    
    if (!response.ok) {
      throw new Error('Failed to fetch configurations');
    }
    
    const serverConfigs = await response.json();
    console.log('Available configurations from server:', serverConfigs);
    
    // Create a new object to store all unique configurations
    const uniqueConfigs = {};
    
    // Add server configurations
    serverConfigs.forEach(configName => {
      uniqueConfigs[configName] = true;
    });
    
    // Add local configurations if they don't already exist on the server
    Object.keys(savedConfigurations).forEach(configName => {
      uniqueConfigs[configName] = true;
    });
    
    // Create dropdown options
    Object.keys(uniqueConfigs).sort().forEach(configName => {
      const option = document.createElement('option');
      option.value = configName;
      option.textContent = configName;
      dropdown.appendChild(option);
    });
    
    console.log('Dropdown populated with unique configurations');
  } catch (error) {
    console.error('Error loading configurations:', error);
    showNotification("Error loading configurations from server", false);
  }
}

// Initialize configurations when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize audio components
  for (let i = 0; i < 10; i++) {
    gainNodes[i].gain.value = 0;
    panNodes[i].pan.value = 0;
  }
  
  // Set master volume initial value
  const masterControl = document.getElementById('masterVolume');
  if (masterControl) {
    masterControl.value = masterVolume;
  }
  
  // Don't call updateConfigurationDropdown here as it's already called in index.ejs
  console.log('Audio components initialized in client.js DOMContentLoaded');
});

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
