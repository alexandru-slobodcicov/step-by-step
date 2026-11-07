(() => {
  class FishingRig {
    constructor(container) {
      this.container = container;
      this.line = container.querySelector("#line");
      this.wire = container.querySelector("#fishing-wire");
      this.path = container.querySelector("#wire-path");
      this.tip = container.querySelector("#rod-tip");
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.active = false;
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    origin() {
      const pond = this.container.getBoundingClientRect();
      const tip = this.tip.getBoundingClientRect();
      return { x: tip.left + tip.width / 2 - pond.left, y: tip.top + tip.height / 2 - pond.top };
    }

    setEnvironment(environment) {
      this.environment = environment;
      const tips = { "star-wars": "#blaster-tip", "hell-support": "#pitchfork-tip" };
      this.tip = this.container.querySelector(tips[environment] || "#rod-tip");
    }

    lowerTo(point) {
      this.active = true;
      this.target = point;
      this.start = performance.now();
      this.lowering = true;
      this.raising = null;
      this.container.classList.add("casting");
      this.line.classList.add("active");
      this.wire.classList.add("active");
      this.draw(this.origin());
    }

    aim(point) {
      this.target = point;
    }

    raiseTo(point) {
      this.target = point;
      this.raising = { start: performance.now(), from: this.position };
    }

    reset() {
      this.active = false;
      this.lowering = false;
      this.raising = null;
      this.container.classList.remove("casting");
      this.line.classList.remove("active");
      this.wire.classList.remove("active");
    }

    draw(point) {
      const origin = this.origin();
      const slack = this.container.classList.contains("fighting") ? 2 : 14;
      const end = this.environment === "star-wars"
        ? `L ${point.x} ${point.y}`
        : `Q ${point.x} ${origin.y + slack} ${point.x} ${point.y}`;
      this.path.setAttribute("d", `M ${origin.x} ${origin.y} ${end}`);
      this.line.style.left = `${point.x}px`;
      this.line.style.top = `${point.y}px`;
      this.position = point;
    }

    frame(now) {
      if (this.active) {
        let point = this.target;
        if (this.lowering) {
          const progress = this.reducedMotion ? 1 : Math.min((now - this.start) / 1200, 1);
          const origin = this.origin();
          const horizontal = 1 - Math.pow(1 - Math.min(progress * 2.5, 1), 3);
          point = {
            x: origin.x + (this.target.x - origin.x) * horizontal,
            y: origin.y + (this.target.y - origin.y) * progress * progress,
          };
          if (progress === 1) this.lowering = false;
        } else if (this.raising) {
          const progress = this.reducedMotion ? 1 : Math.min((now - this.raising.start) / 1200, 1);
          const { from } = this.raising;
          point = {
            x: from.x + (this.target.x - from.x) * progress * progress,
            y: from.y + (this.target.y - from.y) * progress * progress,
          };
          if (progress === 1) this.raising = null;
        }
        this.draw(point);
      }
      requestAnimationFrame(this.frame);
    }
  }

  window.FishingRig = FishingRig;
})();
