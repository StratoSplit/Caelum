# Audio Streaming Dashboard

This project is an audio streaming dashboard that allows you to manage and configure multiple audio streams. It includes a web interface for controlling audio channels, adjusting volume and panning, and saving/loading configurations.

## Prerequisites

- Node.js (version 14 or higher)
- Docker (optional, for running as a container)


## Running the Project Locally

1. Clone the repository:

   ```sh
   git clone <repository-url>
   cd <repository-directory>/app
   ```

2. Install dependencies

   ```sh
   npm install
   ```

3. Start the server

   ```sh
   node server.js
   ```

4. Start the audio stream

   ```sh
   cd ..
   cd audio_stream
   sudo apt-get install ffmpeg -y
   chmod +x ./stream_audio.sh
   ./stream_audio.sh
   ```

5. Navigate to `http://localhost:8000/`

## Running the Project with Docker

1. Clone the repository:

   ```sh
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Build and start the container

   ```sh
   docker-compose up
   ```

3. Navigate to `http://localhost:8000/`