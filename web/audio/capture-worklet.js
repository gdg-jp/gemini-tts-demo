class PcmCapture extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.ratio = processorOptions.rate / sampleRate;
    this.frame = new Int16Array(processorOptions.rate / 10);
    this.index = 0;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const sample of samples) {
      this.sum += sample;
      this.count++;
      this.phase += this.ratio;
      if (this.phase < 1) continue;
      this.phase -= 1;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.frame[this.index++] = Math.round(
        value * (value < 0 ? 32768 : 32767),
      );
      this.sum = 0;
      this.count = 0;
      if (this.index === this.frame.length) {
        const length = this.frame.length;
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(length);
        this.index = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
