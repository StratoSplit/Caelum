import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AudioConfiguration.css';
import {
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
} from '../utils/audioManager';

const AudioConfiguration = () => {
  const channels = Array.from({ length: 10 }, (_, i) => i + 1);

  useEffect(() => {
    updateConfigurationDropdown();
  }, []);

  return (
    <div>
      <nav className="navbar">
        <div className="nav-left">
          <button className="nav-btn">File</button>
          <button className="nav-btn">Tools</button>
          <button className="nav-btn">Circuits</button>
          <button className="nav-btn">Help</button>
        </div>
        <div className="nav-right">
          <button className="nav-btn blue-btn" onClick={muteAll}>Mute All</button>
          <button className="nav-btn blue-btn" onClick={cancelMute}>Cancel Mute</button>
          <button className="nav-btn clear-btn" onClick={clearConfiguration}>Clear Configuration</button>
          <button className="nav-btn">Settings</button>
          <Link to="/logout" className="nav-btn"><button className="nav-btn red-btn">Log Out</button></Link>
          
        </div>
      </nav>

      <div className="container">
        <div className="master-speaker">
          <h3>Master Volume</h3>
          <label>Volume:</label>
          <input type="range" id="masterVolume" min="0" max="1" step="0.01" value="0.5" onInput={(e) => adjustMasterVolume(e.target.value)} />
        </div>

        <div className="channel-sliders">
          {channels.map(i => (
            <div className="channel" id={`channel${i}`} key={i}>
              <h4>Channel {i}</h4>
              <button className="toggle-btn off" id={`toggleButton${i}`} onClick={() => toggleChannel(i)}>Off</button>
              <label>Volume:</label>
              <input type="range" className="channel-slider" id={`volume${i}`} min="0" max="1" step="0.01" value="0.5" onInput={(e) => adjustVolume(i - 1, e.target.value)} />
              <label>Panning:</label>
              <input type="range" className="panning-slider" id={`pan${i}`} min="-1" max="1" step="0.01" value="0" onInput={(e) => adjustPanning(i - 1, e.target.value)} />
            </div>
          ))}
        </div>

        <div className="config-section boxed">
          <div className="active-channels-list">
            <h3>Active Channels</h3>
            <div id="activeChannelsContainer" className="active-channels-space">
              {channels.map(i => (
                <div id={`activeChannel${i}`} className="active-channel" style={{ display: 'none' }} key={i}>
                  <span>Channel {i}</span>
                  <button className="mute-btn" onClick={() => toggleMuteChannel(i)}>Mute</button>
                </div>
              ))}
            </div>
          </div>

          <h3>Save Configuration</h3>
          <input type="text" id="configName" className="config-input" placeholder="Configuration Name" />
          <button className="save-btn styled-save-btn" onClick={saveConfiguration}>Save Configuration</button>

          <h3>Load Configuration</h3>
          <select id="configurationsDropdown" className="config-select" onChange={(e) => loadConfiguration(e.target.value)}>
            <option value="">Select a configuration...</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default AudioConfiguration;