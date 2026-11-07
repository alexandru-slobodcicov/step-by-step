(() => {
  "use strict";

  const effects = {
    start: [[392, 0.09], [523, 0.09], [659, 0.09], [784, 0.18]],
    jump: [[230, 0.12, 700]],
    coin: [[988, 0.055], [1319, 0.12]],
    stomp: [[180, 0.1, 55]],
    hurt: [[330, 0.1], [247, 0.1], [165, 0.22, 70]],
    win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.28]],
    lose: [[392, 0.13], [330, 0.13], [262, 0.13], [131, 0.35]],
    chomp: [[260, 0.055, 510]],
    power: [[330, 0.08], [660, 0.08], [440, 0.08], [880, 0.16]],
    ghost: [[440, 0.07], [660, 0.07], [880, 0.13]],
    shot: [[150, 0.045, 35], [60, 0.035, 25]],
    quack: [[480, 0.07, 260], [420, 0.09, 210]],
    duckHit: [[660, 0.06], [880, 0.09]],
    dogLaugh: [[270, 0.1, 180], [360, 0.1, 240], [270, 0.1, 180], [360, 0.1, 240], [270, 0.1, 150]],
    bark: [[180, 0.09, 100], [240, 0.1, 120]]
  };

  class ArcadeAudio {
    constructor(button) {
      this.button = button;
      this.enabled = true;
      this.context = null;
      this.nodes = new Set();
      button.addEventListener("click", () => {
        this.enabled = !this.enabled;
        if (!this.enabled) this.stop();
        else this.unlock();
        button.textContent = this.enabled ? "Sunet: pornit" : "Sunet: oprit";
        button.setAttribute("aria-pressed", String(this.enabled));
      });
    }

    unlock() {
      if (!this.enabled) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        if (!this.context) this.context = new AudioContext();
        if (this.context.state === "suspended") this.context.resume().catch(() => {});
      } catch {
        // Games remain playable if the browser or device cannot provide audio.
        this.context = null;
      }
    }

    play(name) {
      if (!this.enabled || !this.context || this.context.state === "closed") return;
      const notes = effects[name];
      if (!notes) return;
      let start = this.context.currentTime + 0.005;
      for (const [frequency, duration, endFrequency] of notes) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = name === "chomp" || name === "power" ? "triangle" : "square";
        oscillator.frequency.setValueAtTime(frequency, start);
        if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.007);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        oscillator.connect(gain);
        gain.connect(this.context.destination);
        this.nodes.add(oscillator);
        oscillator.onended = () => {
          this.nodes.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
        start += duration;
      }
    }

    stop() {
      for (const oscillator of this.nodes) {
        try { oscillator.stop(); } catch { /* An already-ended note needs no cleanup. */ }
      }
      this.nodes.clear();
    }
  }

  window.ArcadeAudio = ArcadeAudio;
})();
