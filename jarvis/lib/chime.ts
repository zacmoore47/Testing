export function playCompletionChime() {
  try {
    const ctx = new AudioContext();
    const frequencies = [880, 1108, 1318];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 1.2);
    });
  } catch {
    // Silently fail if AudioContext not available
  }
}

export function createBrownNoise(): { start: () => void; stop: () => void } | null {
  try {
    const ctx = new AudioContext();
    const bufferSize = 4096;
    let lastOut = 0;

    const node = ctx.createScriptProcessor(bufferSize, 1, 1);
    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    };

    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;

    node.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    return {
      start: () => { if (ctx.state === "suspended") void ctx.resume(); },
      stop: () => { node.disconnect(); void ctx.close(); },
    };
  } catch {
    return null;
  }
}
