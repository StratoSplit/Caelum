class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.readIndex = 0;
    this.writeIndex = 0;
    this.dataLength = 0; // Track valid data in buffer

    this.port.onmessage = (event) => {
      const newData = event.data;
      this.writeData(newData);
    };
  }

  writeData(newData) {
    for (let i = 0; i < newData.length; i++) {
      this.buffer[this.writeIndex] = newData[i];
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;

      // Avoid overwriting unread data
      if (this.dataLength < this.buffer.length) {
        this.dataLength++;
      } else {
        // Overwrite oldest data by advancing readIndex
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      if (this.dataLength > 0) {
        output[i] = this.buffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.buffer.length;
        this.dataLength--;
      } else {
        output[i] = 0; // Silence if buffer is empty
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
