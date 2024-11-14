#!/bin/bash

# Multicast addresses and ports for RTP streaming
MULTICAST_IP1="239.0.0.1"
MULTICAST_IP2="239.0.0.2"
MULTICAST_IP3="239.0.0.3"
MULTICAST_IP4="239.0.0.4"
MULTICAST_IP5="239.0.0.5"
MULTICAST_IP6="239.0.0.6"
MULTICAST_IP7="239.0.0.7"
MULTICAST_IP8="239.0.0.8"
MULTICAST_IP9="239.0.0.9"
MULTICAST_IP10="239.0.0.10"

PORT1=5001
PORT2=5003
PORT3=5005
PORT4=5007
PORT5=5009
PORT6=5011
PORT7=5013
PORT8=5015
PORT9=5017
PORT10=5019

# Stream each audio file using RTP with 16-bit PCM to a unique address and port
ffmpeg -re -i "bread.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP1:$PORT1 &
ffmpeg -re -i "hip-hop.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP2:$PORT2 &
ffmpeg -re -i "firmament.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP3:$PORT3 &
ffmpeg -re -i "cars.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP4:$PORT4 &
ffmpeg -re -i "helicopter.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP5:$PORT5 &
ffmpeg -re -i "drum.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP6:$PORT6 &
ffmpeg -re -i "rain.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP7:$PORT7 &
ffmpeg -re -i "hawk.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP8:$PORT8 &
ffmpeg -re -i "clock.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP9:$PORT9 &
ffmpeg -re -i "river.mp3" -c:a pcm_s16le -ar 48000 -ac 1 -f rtp rtp://$MULTICAST_IP10:$PORT10 &

# Wait for all background processes to finish
wait
