import random
import socket
import time
import threading
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

PING_ADDRESS = "239.0.0.11"
PING_PORT = 5000

RTP_HEADER_SIZE = 12
SAMPLE_RATE = 48000
FRAME_SIZE = 960

streaming_active = False  # Controls whether audio streams are running
last_streaming_state = False  # Tracks last known state before stopping
stream_threads = []  # Stores active streaming threads


def create_rtp_packet(payload, sequence_number, timestamp, ssrc=12345):
    """Creates an RTP packet with a header."""
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


def stream_audio(file, address, port):
    """Streams an MP3 file over RTP."""
    global streaming_active

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)

    audio = AudioSegment.from_mp3(file).set_frame_rate(SAMPLE_RATE).set_channels(1).set_sample_width(2)
    audio = audio[:15000]  # First 15 seconds
    raw_audio = np.array(audio.get_array_of_samples(), dtype=np.int16).tobytes()

    sequence_number = 0
    timestamp = 0

    start_time = time.time()
    while streaming_active and time.time() - start_time < 15:
        for i in range(0, len(raw_audio), FRAME_SIZE * 2):
            if not streaming_active:
                break  # Stop immediately if ping received

            frame = raw_audio[i:i + FRAME_SIZE * 2]
            if len(frame) < FRAME_SIZE * 2:
                break

            packet = create_rtp_packet(frame, sequence_number, timestamp)
            sock.sendto(packet, (address, port))

            sequence_number += 1
            timestamp += FRAME_SIZE

            time.sleep(FRAME_SIZE / SAMPLE_RATE)  # Real-time speed

    sock.close()


def start_streaming():
    """Randomly selects and starts 0-4 streams."""
    global stream_threads, streaming_active, last_streaming_state
    if streaming_active:
        print("Streaming already active.")
        return

    streaming_active = True
    last_streaming_state = True  # Remember that we started streaming
    selected_streams = random.sample(AUDIO_STREAMS, random.randint(0, 4))

    for stream in selected_streams:
        thread = threading.Thread(target=stream_audio, args=(stream["file"], stream["address"], stream["port"]))
        thread.start()
        stream_threads.append(thread)

    print("Streaming started.")


def stop_streaming():
    """Stops all running streams."""
    global streaming_active, stream_threads, last_streaming_state
    streaming_active = False
    last_streaming_state = False  # Remember that we stopped streaming

    for thread in stream_threads:
        thread.join()  # Ensure all streaming threads stop
    stream_threads = []
    print("Streaming stopped.")


def listen_for_ping():
    """Listens for a ping signal to start/stop streaming."""
    global last_streaming_state

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((PING_ADDRESS, PING_PORT))

    mreq = socket.inet_aton(PING_ADDRESS) + socket.inet_aton("0.0.0.0")
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)

    print(f"Listening for pings on {PING_ADDRESS}:{PING_PORT}...")

    while True:
        data, addr = sock.recvfrom(1024)
        print(f"Ping received from {addr}")

        if streaming_active:
            stop_streaming()
        else:
            # If last state was stopped, start streaming
            if not last_streaming_state:
                start_streaming()
            else:
                print("Streaming stopped due to timeout, waiting for another ping to restart.")


if __name__ == "__main__":
    listen_for_ping()