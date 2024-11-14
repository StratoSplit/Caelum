FROM ubuntu:latest

RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

WORKDIR /usr/src/audio_stream

COPY stream_audio.sh .

RUN chmod +x stream_audio.sh

CMD ["sh", "stream_audio.sh"]