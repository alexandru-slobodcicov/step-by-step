(() => {
  class PondSound {
    constructor() {
      this.muted = localStorage.getItem("fishing-app-muted") === "true";
      this.context = null;
    }

    unlock() {
      if (this.muted) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        this.context ||= new AudioContext();
        if (this.context.state === "suspended") this.context.resume().catch(() => {});
      } catch {
        // Sound is optional; browsers without audio still get the complete game.
      }
    }

    toggle() {
      this.muted = !this.muted;
      localStorage.setItem("fishing-app-muted", String(this.muted));
      if (this.muted && this.context) this.context.suspend().catch(() => {});
      else this.unlock();
    }

    tone(frequency, offset, duration, type = "sine", volume = 0.1) {
      if (this.muted || !this.context) return;
      const at = this.context.currentTime + offset;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.7, at + duration);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(at);
      oscillator.stop(at + duration);
    }

    play(effect) {
      this.unlock();
      if (this.environment === "hell-support") {
        this.support(effect);
        return;
      }
      if (effect === "add") this.tone(660, 0, 0.16, "sine", 0.06);
      if (effect === "cast") {
        this.tone(320, 0, 0.4, "triangle", 0.07);
        this.splash(0.55);
      }
      if (effect === "bite") {
        this.tone(740, 0, 0.12);
        this.tone(980, 0.16, 0.18);
        this.splash(0);
      }
      if (effect === "reel") {
        for (let i = 0; i < 10; i++) this.tone(180 + i * 32, i * 0.09, 0.055, "triangle", 0.035);
      }
      if (effect === "fight") {
        for (let i = 0; i < 8; i++) {
          this.tone(i % 2 ? 270 : 380, i * 0.36, 0.14, "triangle", 0.055);
          if (i % 2 === 0) this.splash(i * 0.36);
        }
      }
      if (effect === "escape") {
        [740, 520, 330].forEach((note, i) => this.tone(note, i * 0.12, 0.22, "triangle"));
        this.splash(0.1);
      }
      if (effect === "win") {
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => this.tone(note, i * 0.13, 0.4));
      }
    }

    support(effect) {
      // Finite recorder-like hold music: no autoplay or lingering audio loop.
      const hold = [659, 784, 735, 587, 659, 523, 494, 587];
      if (effect === "cast" || effect === "fight") {
        hold.forEach((note, i) => this.tone(note, i * 0.28, 0.22, "triangle", 0.045));
      } else if (effect === "escape") {
        [440, 349, 277, 220].forEach((note, i) => this.tone(note, i * 0.18, 0.2, "square", 0.025));
      } else if (effect === "win") {
        [523, 659, 784, 1047].forEach((note, i) => this.tone(note, i * 0.14, 0.3, "triangle", 0.06));
        this.tone(196, 0.7, 0.25, "sawtooth", 0.025);
      } else if (effect === "reel") {
        for (let i = 0; i < 8; i++) this.tone(160 + i % 3 * 45, i * 0.09, 0.06, "square", 0.025);
      } else {
        this.tone(880, 0, 0.12, "triangle", 0.055);
        if (effect === "bite") this.tone(660, 0.17, 0.15, "triangle", 0.055);
      }
    }

    splash(offset) {
      if (this.muted || !this.context) return;
      if (this.environment === "star-wars") {
        this.tone(680, offset, 0.18, "sawtooth", 0.035);
        this.tone(110, offset + 0.04, 0.24, "triangle", 0.055);
        return;
      }
      const length = this.context.sampleRate * 0.45;
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      const at = this.context.currentTime + offset;
      filter.type = "lowpass";
      filter.frequency.value = 1600;
      gain.gain.setValueAtTime(0.12, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(this.context.destination);
      source.start(at);
    }
  }

  window.PondSound = PondSound;
})();
