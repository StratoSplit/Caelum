class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.readIndex = 0;
    this.writeIndex = 0;

    this.port.onmessage = (event) => {
      const newData = event.data;
      this.writeData(newData);
    };
  }

  writeData(newData) {
    // Write incoming data to the buffer, wrapping around as necessary
    for (let i = 0; i < newData.length; i++) {
      this.buffer[this.writeIndex] = newData[i];
      this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.buffer.length;
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);

