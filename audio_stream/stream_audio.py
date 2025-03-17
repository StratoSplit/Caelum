import random
import socket
import time
import threading
import json
import numpy as np
from pydub import AudioSegment

# Define multicast groups and ports
AUDIO_STREAMS = [
    {"file": "bread.mp3", "address": "239.0.0.1", "port": 5001},
    {"file": "hip-hop.mp3", "address": "239.0.0.2", "port": 5003},
    {"file": "firmament.mp3", "address": "239.0.0.3", "port": 5005},
    {"file": "cars.mp3", "address": "239.0.0.4", "port": 5007},
    {"file": "helicopter.mp3", "address": "239.0.0.5", "port": 5009},
    {"file": "drum.mp3", "address": "239.0.0.6", "port": 5011},
    {"file": "rain.mp3", "address": "239.0.0.7", "port": 5013},
    {"file": "hawk.mp3", "address": "239.0.0.8", "port": 5015},
    {"file": "clock.mp3", "address": "239.0.0.9", "port": 5017},
    {"file": "river.mp3", "address": "239.0.0.10", "port": 5019},
]

# Define multicast group and port for receiving commands
PING_ADDRESS = "239.0.0.11"
PING_PORT = 5000

# Define packet properties
RTP_HEADER_SIZE = 12
SAMPLE_RATE = 48000
FRAME_SIZE = 960

streaming_active = False  
stream_threads = [] 

STREAM_MAPPING = {i+1: AUDIO_STREAMS[i] for i in range(len(AUDIO_STREAMS))}

def create_rtp_packet(payload, sequence_number, timestamp, ssrc=12345):
    header = bytearray(12)
    header[0] = 0x80
    header[1] = 0x7F
    header[2] = (sequence_number >> 8) & 0xFF
    header[3] = sequence_number & 0xFF
    header[4] = (timestamp >> 24) & 0xFF
    header[5] = (timestamp >> 16) & 0xFF
    header[6] = (timestamp >> 8) & 0xFF
    header[7] = timestamp & 0xFF
    header[8] = (ssrc >> 24) & 0xFF
    header[9] = (ssrc >> 16) & 0xFF
    header[10] = (ssrc >> 8) & 0xFF
    header[11] = ssrc & 0xFF

    return header + payload

def stream_audio(file, address, port, duration):
    global streaming_active

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)

    # Load and process the audio file
    audio = AudioSegment.from_mp3(file).set_frame_rate(SAMPLE_RATE).set_channels(1).set_sample_width(2)
    file_duration = len(audio) / 1000  # Convert milliseconds to seconds

    # Extend audio by looping if it is shorter than the required duration
    if file_duration < duration:
        num_repeats = int(duration / file_duration) + 1  # Ensure enough loops
        audio = audio * num_repeats  # Concatenate copies of itself
    audio = audio[:duration * 1000]  # Trim any excess audio beyond duration

    raw_audio = np.array(audio.get_array_of_samples(), dtype=np.int16).tobytes()

    sequence_number = 0
    timestamp = 0
    start_time = time.perf_counter()

    print(f"Streaming {file} on {address}:{port} for {duration} seconds.")

    frame_size_bytes = FRAME_SIZE * 2
    num_frames = len(raw_audio) // frame_size_bytes

    frame_index = 0  # Track position in audio

    while streaming_active and (time.perf_counter() - start_time < duration):
        # Extract the next frame
        start_byte = frame_index * frame_size_bytes
        end_byte = start_byte + frame_size_bytes

        if end_byte > len(raw_audio):  # If reaching the end, wrap around
            frame_index = 0
            start_byte = 0
            end_byte = frame_size_bytes

        frame = raw_audio[start_byte:end_byte]

        if len(frame) < frame_size_bytes:
            break  # Stop if the frame is incomplete (shouldn't happen with looping)

        packet = create_rtp_packet(frame, sequence_number, timestamp)
        sock.sendto(packet, (address, port))

        sequence_number += 1
        timestamp += FRAME_SIZE
        frame_index += 1  # Move to next frame

        next_send_time = start_time + ((sequence_number + 1) * FRAME_SIZE / SAMPLE_RATE)
        while time.perf_counter() < next_send_time:
            pass  # Sleep until it's time to send the next frame

    sock.close()
    print(f"Streaming {file} stopped.")
    streaming_active = False


def start_streams(selected_streams, duration):
    global stream_threads, streaming_active, last_streaming_state
    if streaming_active:
        print("Streaming already active.")
        return

    streaming_active = True

    for stream in selected_streams:
        thread = threading.Thread(target=stream_audio, args=(stream["file"], stream["address"], stream["port"], duration))
        thread.start()
        stream_threads.append(thread)

def stop_streaming():
    global streaming_active, stream_threads, last_streaming_state
    streaming_active = False 

    for thread in stream_threads:
        thread.join()  
    stream_threads = []
    print("Streaming stopped.")


def listen_for_commands():
    # Listen for commands
    global last_streaming_state

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((PING_ADDRESS, PING_PORT))

    mreq = socket.inet_aton(PING_ADDRESS) + socket.inet_aton("0.0.0.0")
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)

    print(f"Listening for pings on {PING_ADDRESS}:{PING_PORT}...")

    while True:
        data, addr = sock.recvfrom(1024)
        try:
            message = json.loads(data.decode("utf-8"))
            command = message.get("command")
            duration = int(message.get("duration", 15))
            numbers = message.get("channels", [])

            print(f"Received command: {command}, Channels: {numbers}, Duration: {duration}")

            if command == "stop":
                stop_streaming()

            elif command == "start":
                selected_streams = [STREAM_MAPPING[n] for n in numbers if n in STREAM_MAPPING]

                if selected_streams:
                    start_streams(selected_streams, duration)

        except json.JSONDecodeError:
            print(f"Invalid message received: {data}")

        
        
if __name__ == "__main__":
    listen_for_commands()
