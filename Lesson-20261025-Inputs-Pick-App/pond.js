(() => {
  const TYPES = [
    { id: "clownfish", label: "Clownfish (Nemo)", color: [1, 0.42, 0.06], size: [0.38, 0.24, 0.18] },
    { id: "shark", label: "Shark", color: [0.4, 0.55, 0.61], size: [0.64, 0.2, 0.22] },
    { id: "sea-bass", label: "Sea bass", color: [0.58, 0.69, 0.49], size: [0.49, 0.26, 0.19] },
  ];
  const PITCH = 0.42;
  const DISTANCE = 11;
  const FOV = 1 / Math.tan(Math.PI / 7);

  class Pond3D {
    constructor(canvas, container, rig) {
      this.canvas = canvas;
      this.container = container;
      this.rig = rig;
      this.fish = new Map();
      this.nextFish = 0;
      this.environment = "fish-pond";
      this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.gl = canvas.getContext("webgl", { alpha: true, antialias: true });
      this.available = false;
      if (!this.gl) return;
      try {
        this.initialize();
        this.available = true;
      } catch (error) {
        console.warn("3D pond unavailable; using the accessible fish view.", error);
        return;
      }
      this.frame = this.frame.bind(this);
      requestAnimationFrame(this.frame);
    }

    initialize() {
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        uniform mat4 uProjection;
        uniform vec3 uPosition;
        uniform vec3 uScale;
        uniform float uTurn;
        uniform float uAngle;
        uniform vec3 uPivot;
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying float vStripe;
        void main() {
          vec3 p = aPosition * uScale;
          p.x *= uTurn;
          vWorld = p + uPosition;
          vNormal = normalize(aNormal / uScale * vec3(uTurn, 1., 1.));
          mat2 rotation = mat2(cos(uAngle), sin(uAngle), -sin(uAngle), cos(uAngle));
          vWorld.xy = rotation * (vWorld.xy - uPivot.xy) + uPivot.xy;
          vNormal.xy = rotation * vNormal.xy;
          vStripe = aPosition.x;
          float c = cos(0.42), s = sin(0.42);
          vec3 view = vec3(vWorld.x, c*vWorld.y-s*vWorld.z, s*vWorld.y+c*vWorld.z-11.);
          gl_Position = uProjection * vec4(view, 1.);
        }
      `);
      const fragment = compile(gl.FRAGMENT_SHADER, `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uPattern;
        uniform float uSpace;
        uniform float uHell;
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying float vStripe;
        void main() {
          float light = .48 + .52 * max(dot(normalize(vNormal), normalize(vec3(-.5, 1., 1.))), 0.);
          float ripple = sin(vWorld.x*7.+uTime)*sin(vWorld.z*8.-uTime)*.035*(1.-uSpace);
          vec3 base = uColor;
          if (uPattern > .5) {
            float band = min(abs(vStripe), min(abs(vStripe-.64), abs(vStripe+.64)));
            if (band < .16) base = vec3(.07, .13, .15);
            if (band < .105) base = vec3(1., .98, .89);
          }
          vec3 color = base * (light + ripple);
          float fog = clamp((2.-vWorld.z)*.035, 0., .2);
          vec3 fogColor = mix(vec3(.08,.42,.5), vec3(.02,.035,.08), uSpace);
          fogColor = mix(fogColor, vec3(.55,.16,.08), uHell);
          gl_FragColor = vec4(mix(color, fogColor, fog), 1.);
        }
      `);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.useProgram(this.program);
      this.uniforms = {};
      ["Projection", "Position", "Scale", "Turn", "Color", "Time", "Angle", "Pivot", "Pattern", "Space", "Hell"].forEach((name) => {
        this.uniforms[name] = gl.getUniformLocation(this.program, `u${name}`);
      });
      this.positionAttribute = gl.getAttribLocation(this.program, "aPosition");
      this.normalAttribute = gl.getAttribLocation(this.program, "aNormal");
      this.sphere = this.createSphere();
      this.fin = this.createMesh([
        0, 0, 0, -1, 0.8, 0.1, -1, -0.8, 0.1,
        0, 0, 0, -1, -0.8, -0.1, -1, 0.8, -0.1,
        -1, 0.8, 0.1, -1, 0.8, -0.1, -1, -0.8, -0.1,
        -1, 0.8, 0.1, -1, -0.8, -0.1, -1, -0.8, 0.1,
      ]);
      this.dorsal = this.createMesh([
        -0.3, 0, 0.04, 0.08, 0.5, 0, 0.3, 0, 0.04,
        -0.3, 0, -0.04, 0.3, 0, -0.04, 0.08, 0.5, 0,
        -0.3, 0, 0.04, -0.3, 0, -0.04, 0.08, 0.5, 0,
        0.3, 0, 0.04, 0.08, 0.5, 0, 0.3, 0, -0.04,
      ]);
      const cube = [];
      const faces = [
        [[-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]],
        [[1,-1,-1], [-1,-1,-1], [-1,1,-1], [1,1,-1]],
        [[-1,1,1], [1,1,1], [1,1,-1], [-1,1,-1]],
        [[-1,-1,-1], [1,-1,-1], [1,-1,1], [-1,-1,1]],
        [[1,-1,1], [1,-1,-1], [1,1,-1], [1,1,1]],
        [[-1,-1,-1], [-1,-1,1], [-1,1,1], [-1,1,-1]],
      ];
      for (const face of faces) {
        for (const index of [0, 1, 2, 0, 2, 3]) cube.push(...face[index]);
      }
      this.cube = this.createMesh(cube);
      this.destroyer = this.createMesh([
        1,0,0, -1,1,-1, -1,1,1,
        1,0,0, -1,-1,1, -1,-1,-1,
        1,0,0, -1,1,1, -1,-1,1,
        1,0,0, -1,-1,-1, -1,1,-1,
        -1,1,1, -1,1,-1, -1,-1,-1,
        -1,1,1, -1,-1,-1, -1,-1,1,
      ]);
      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
    }

    createMesh(vertices, normals) {
      const gl = this.gl;
      if (!normals) {
        normals = [];
        for (let i = 0; i < vertices.length; i += 9) {
          const a = vertices.slice(i, i + 3);
          const b = vertices.slice(i + 3, i + 6).map((v, j) => v - a[j]);
          const c = vertices.slice(i + 6, i + 9).map((v, j) => v - a[j]);
          const n = [b[1]*c[2]-b[2]*c[1], b[2]*c[0]-b[0]*c[2], b[0]*c[1]-b[1]*c[0]];
          normals.push(...n, ...n, ...n);
        }
      }
      const buffer = (data) => {
        const result = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, result);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        return result;
      };
      return { vertices: buffer(vertices), normals: buffer(normals), count: vertices.length / 3 };
    }

    createSphere() {
      const vertices = [];
      const point = (lat, lon) => {
        const a = lat * Math.PI / 10;
        const b = lon * Math.PI * 2 / 16;
        return [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
      };
      for (let lat = 0; lat < 10; lat++) {
        for (let lon = 0; lon < 16; lon++) {
          const a = point(lat, lon), b = point(lat + 1, lon);
          const c = point(lat + 1, lon + 1), d = point(lat, lon + 1);
          vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
      }
      return this.createMesh(vertices, vertices);
    }

    add(name, label) {
      const index = this.nextFish++;
      const type = TYPES[index % TYPES.length];
      this.fish.set(name, {
        label, x: ((index * 0.618034 + 0.5) % 1) * 6.2 - 3.1,
        y: ((index * 0.754877 + 0.25) % 1) * 1.9 - 0.65,
        z: ((index * 0.381966) % 1) * 3.2 - 1.6, phase: Math.random() * Math.PI * 2,
        type, color: type.color, caught: false, lift: 0, fighting: false,
      });
      return type;
    }

    remove(name) {
      this.fish.delete(name);
      if (this.castState?.name === name) this.castState = null;
    }

    setEnvironment(environment) {
      this.environment = ["star-wars", "hell-support"].includes(environment) ? environment : "fish-pond";
    }

    mouthOffset(fish) {
      return fish.type.id === "shark" ? 0.72 : fish.type.size[0] * 0.98;
    }

    cast(name) {
      const fish = this.fish.get(name);
      if (!fish) return;
      const [x, y, z] = fish.position || [fish.x, fish.y, fish.z];
      const turn = x > 1 ? -1 : 1;
      this.castState = { name, turn, hook: [x + turn * 1.8, y + 0.03, z] };
      this.rig?.lowerTo(this.project(...this.castState.hook));
    }

    approach(name) {
      const fish = this.fish.get(name);
      if (!fish || this.castState?.name !== name) return;
      const { hook, turn } = this.castState;
      fish.approaching = {
        start: performance.now(),
        from: fish.position || [fish.x, fish.y, fish.z],
        to: [hook[0] - turn * this.mouthOffset(fish), hook[1] - 0.03, hook[2]],
      };
      fish.turn = turn;
    }

    catch(name) {
      const fish = this.fish.get(name);
      if (fish) {
        if (fish.approaching) {
          this.updateFish(fish, performance.now());
          fish.approaching = null;
        }
        fish.px = fish.position?.[0] ?? fish.x;
        fish.py = fish.position?.[1] ?? fish.y;
        fish.caught = true;
        fish.returning = null;
      }
    }

    fight(name) {
      const fish = this.fish.get(name);
      if (fish) fish.fighting = true;
    }

    escape(name) {
      const fish = this.fish.get(name);
      if (!fish) return;
      fish.returning = { start: performance.now(), from: fish.position || [fish.x, fish.y, fish.z] };
      fish.caught = false;
      fish.fighting = false;
      fish.lift = 0;
      fish.approaching = null;
      this.castState = null;
    }

    reel(name) {
      const fish = this.fish.get(name);
      if (fish) {
        fish.fighting = false;
        fish.lift = performance.now();
      }
    }

    project(x, y, z) {
      const depth = DISTANCE - Math.sin(PITCH) * y - Math.cos(PITCH) * z;
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      const focal = FOV * 1.25 * Math.min(1, aspect / 1.45);
      return {
        x: (1 + focal * x / depth / aspect) * this.canvas.clientWidth / 2,
        y: (1 - focal * (Math.cos(PITCH) * y - Math.sin(PITCH) * z) / depth) * this.canvas.clientHeight / 2,
      };
    }

    draw(mesh, position, scale, color, turn = 1, pattern = 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices);
      gl.enableVertexAttribArray(this.positionAttribute);
      gl.vertexAttribPointer(this.positionAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normals);
      gl.enableVertexAttribArray(this.normalAttribute);
      gl.vertexAttribPointer(this.normalAttribute, 3, gl.FLOAT, false, 0, 0);
      gl.uniform3fv(this.uniforms.Position, position);
      gl.uniform3fv(this.uniforms.Scale, scale);
      gl.uniform3fv(this.uniforms.Color, color);
      gl.uniform1f(this.uniforms.Turn, turn);
      gl.uniform1f(this.uniforms.Pattern, pattern);
      gl.uniform1f(this.uniforms.Angle, this.pose?.angle || 0);
      gl.uniform3fv(this.uniforms.Pivot, this.pose?.pivot || [0, 0, 0]);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }

    drawFish(fish, x, y, z, turn, time, angle) {
      const { type, color } = fish;
      const [length, height, width] = type.size;
      const shark = type.id === "shark";
      this.pose = { angle, pivot: [x, y, z] };
      const tailBeat = Math.sin(time * (fish.fighting ? 34 : 9) + fish.phase);
      this.draw(this.fin, [x - turn * length * 0.8, y, z], [length * 0.8, height * 1.3, 0.7 + tailBeat * 0.4], color, turn);
      this.draw(this.dorsal, [x - turn * 0.07, y + height * 0.6, z], [shark ? 0.85 : 0.8, shark ? 0.95 : 0.4, 1], color, turn);
      if (shark) {
        this.draw(this.fin, [x + turn * 0.02, y - 0.06, z + 0.12], [0.35, 0.12, 2.8], color, turn);
        this.draw(this.sphere, [x + turn * 0.42, y - 0.01, z], [0.32, 0.13, 0.17], color);
      }
      this.draw(this.sphere, [x, y, z], type.size, color, 1, type.id === "clownfish" ? 1 : 0);
      if (shark) {
        this.draw(this.sphere, [x + turn * 0.1, y - 0.095, z + 0.015], [0.52, 0.1, 0.2], [0.84, 0.9, 0.88]);
        for (let i = 0; i < 3; i++) {
          this.draw(this.sphere, [x + turn * (0.04 + i * 0.08), y, z + width], [0.012, 0.075, 0.012], [0.19, 0.3, 0.34]);
        }
      } else if (type.id === "sea-bass") {
        this.draw(this.sphere, [x, y - 0.025, z + width * 0.96], [0.41, 0.027, 0.025], [0.22, 0.38, 0.3]);
        this.draw(this.sphere, [x + turn * 0.21, y, z + width], [0.015, 0.15, 0.015], [0.38, 0.49, 0.4]);
      }
      const eyeX = x + turn * length * 0.62;
      this.draw(this.sphere, [eyeX, y + 0.075, z + width * 0.77], [0.062, 0.062, 0.035], [1, 0.98, 0.87]);
      this.draw(this.sphere, [eyeX + turn * 0.015, y + 0.075, z + width * 0.96], [0.027, 0.033, 0.018], [0.035, 0.12, 0.15]);
      this.pose = null;
    }

    drawShip(fish, x, y, z, turn, time, angle) {
      this.pose = { angle, pivot: [x, y, z] };
      const hull = [0.73, 0.79, 0.85];
      const dark = [0.12, 0.18, 0.27];
      const glass = [0.24, 0.57, 0.81];
      const engine = [0.5 + Math.sin(time * 8) * 0.1, 0.78, 1];
      if (fish.type.id === "clownfish") {
        // Four spread wings and long laser cannons, around a narrow fuselage.
        for (const side of [-1, 1]) {
          for (const depth of [-1, 1]) {
            this.draw(this.cube, [x - turn * 0.13, y + side * 0.13, z + depth * 0.18], [0.17, 0.028, 0.21], hull);
            this.draw(this.sphere, [x, y + side * 0.18, z + depth * 0.34], [0.29, 0.018, 0.018], dark);
            this.draw(this.sphere, [x - turn * 0.28, y + side * 0.12, z + depth * 0.17], [0.055, 0.055, 0.055], engine);
          }
        }
        this.draw(this.sphere, [x, y, z], [0.38, 0.075, 0.09], hull);
        this.draw(this.sphere, [x - turn * 0.07, y + 0.06, z + 0.045], [0.13, 0.07, 0.07], glass);
        this.draw(this.cube, [x + turn * 0.14, y + 0.07, z], [0.14, 0.01, 0.025], [0.79, 0.23, 0.2]);
      } else if (fish.type.id === "shark") {
        this.draw(this.destroyer, [x, y, z], [0.72, 0.1, 0.39], hull, turn);
        this.draw(this.cube, [x - turn * 0.28, y + 0.12, z], [0.24, 0.04, 0.19], [0.56, 0.65, 0.75]);
        this.draw(this.cube, [x - turn * 0.35, y + 0.2, z], [0.12, 0.05, 0.14], hull);
        this.draw(this.cube, [x - turn * 0.35, y + 0.21, z + 0.14], [0.1, 0.018, 0.009], glass);
        for (const depth of [-0.24, 0, 0.24]) {
          this.draw(this.sphere, [x - turn * 0.72, y, z + depth], [0.035, 0.05, 0.06], engine);
        }
      } else {
        // The TIE silhouette: twin tall solar panels and a round cockpit.
        this.draw(this.sphere, [x, y, z], [0.43, 0.035, 0.045], hull);
        for (const side of [-1, 1]) {
          this.draw(this.cube, [x + side * 0.41, y, z], [0.065, 0.34, 0.2], hull);
          this.draw(this.cube, [x + side * 0.41, y, z + 0.205], [0.045, 0.29, 0.008], dark);
          this.draw(this.cube, [x + side * 0.41, y, z + 0.216], [0.05, 0.012, 0.008], [0.43, 0.54, 0.68]);
        }
        this.draw(this.sphere, [x, y, z + 0.02], [0.18, 0.18, 0.18], hull);
        this.draw(this.sphere, [x, y, z + 0.17], [0.12, 0.12, 0.04], glass);
        this.draw(this.cube, [x, y, z + 0.215], [0.11, 0.012, 0.008], dark);
        this.draw(this.cube, [x, y, z + 0.215], [0.012, 0.11, 0.008], dark);
      }
      this.pose = null;
    }

    updateFish(fish, now) {
      const time = this.reducedMotion ? 0 : now / 1000;
      if (!fish.caught && !fish.approaching) {
        fish.px = fish.x + Math.sin(time * 0.45 + fish.phase) * 0.65;
        fish.py = fish.y + Math.sin(time * 1.3 + fish.phase) * 0.1;
        fish.turn = Math.cos(time * 0.45 + fish.phase) >= 0 ? 1 : -1;
      }
      const struggle = fish.fighting && !this.reducedMotion;
      let x = (fish.px ?? fish.x) + (struggle ? Math.sin(time * 17 + fish.phase) * 0.3 : 0);
      const lift = fish.lift ? Math.min((now - fish.lift) / 1200, 1) : 0;
      let y = (fish.py ?? fish.y) + lift * 2.4 + (struggle ? Math.sin(time * 23) * 0.18 : 0);
      let z = fish.z + (struggle ? Math.sin(time * 11) * 0.12 : 0);
      if (fish.approaching) {
        const { start, from, to } = fish.approaching;
        const progress = this.reducedMotion ? 1 : Math.min((now - start) / 1200, 1);
        const blend = progress * progress * (3 - 2 * progress);
        [x, y, z] = from.map((value, i) => value + (to[i] - value) * blend);
      }
      if (fish.returning) {
        const progress = Math.min((now - fish.returning.start) / 700, 1);
        const blend = this.reducedMotion ? 1 : 1 - Math.pow(1 - progress, 3);
        [x, y, z] = [x, y, z].map((value, i) => fish.returning.from[i] + (value - fish.returning.from[i]) * blend);
        if (progress === 1) fish.returning = null;
      }
      fish.position = [x, y, z];
      return { x, y, z, turn: fish.turn || 1, angle: struggle ? Math.sin(time * 19 + fish.phase) * 0.65 : 0 };
    }

    drawCaller(fish, x, y, z, turn, time, angle) {
      this.pose = { angle, pivot: [x, y, z] };
      const cream = [0.94, 0.91, 0.76];
      const dark = [0.2, 0.16, 0.18];
      if (fish.type.id === "clownfish") {
        this.draw(this.sphere, [x, y + 0.04, z], [0.32, 0.35, 0.2], cream);
        for (let i = 0; i < 3; i++) {
          this.draw(this.sphere, [x + (i - 1) * 0.21, y - 0.24 + Math.sin(time * 5 + i) * 0.03, z], [0.12, 0.17, 0.16], cream);
        }
        for (const dx of [-0.11, 0.11]) {
          this.draw(this.sphere, [x + dx, y + 0.12, z + 0.19], [0.045, 0.065, 0.025], dark);
          this.draw(this.cube, [x + dx, y + 0.22, z + 0.18], [0.08, 0.018, 0.025], dark);
        }
        this.draw(this.sphere, [x, y - 0.06, z + 0.2], [0.085, 0.045, 0.02], dark);
      } else if (fish.type.id === "shark") {
        this.draw(this.cube, [x, y - 0.12, z], [0.58, 0.28, 0.2], dark);
        this.draw(this.cube, [x, y - 0.08, z + 0.21], [0.045, 0.23, 0.015], [0.93, 0.61, 0.2]);
        for (let i = -1; i <= 1; i++) {
          const hx = x + i * 0.4, hy = y + 0.25 + (i === 0 ? 0.1 : 0);
          this.draw(this.sphere, [hx, hy, z], [0.21, 0.23, 0.19], [0.85, 0.37 + i * 0.06, 0.22]);
          for (const dx of [-0.09, 0.09]) {
            this.draw(this.dorsal, [hx + dx, hy + 0.15, z], [0.15, 0.32, 0.6], cream);
            this.draw(this.sphere, [hx + dx, hy + 0.03, z + 0.18], [0.027, 0.025, 0.018], dark);
          }
          this.draw(this.cube, [hx, hy - 0.09, z + 0.18], [0.08, 0.018, 0.015], dark);
        }
      } else {
        this.draw(this.cube, [x, y - 0.02, z], [0.42, 0.24, 0.23], [0.66, 0.66, 0.57]);
        this.draw(this.cube, [x, y + 0.21, z], [0.33, 0.055, 0.21], dark);
        this.draw(this.cube, [x + Math.sin(time * 7) * 0.035, y + 0.39, z - 0.05], [0.27, 0.18, 0.025], cream);
        for (let i = 0; i < 3; i++) {
          this.draw(this.cube, [x, y + 0.3 + i * 0.07, z - 0.02], [0.19, 0.008, 0.006], dark);
        }
        this.draw(this.cube, [x, y - 0.1, z + 0.235], [0.28, 0.07, 0.015], dark);
        for (const dx of [-0.27, 0.27]) {
          this.draw(this.sphere, [x + dx, y + 0.07, z + 0.24], [0.045, 0.04, 0.025], [1, 0.24, 0.08]);
        }
      }
      this.pose = null;
    }

    frame(now) {
      const gl = this.gl;
      const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
        this.canvas.width = Math.round(width * ratio);
        this.canvas.height = Math.round(height * ratio);
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const aspect = width / height;
      const focal = FOV * 1.25 * Math.min(1, aspect / 1.45);
      // A perspective camera, not a flat scale/translate effect.
      gl.uniformMatrix4fv(this.uniforms.Projection, false, new Float32Array([
        focal/aspect,0,0,0, 0,focal,0,0, 0,0,-1.002,-1, 0,0,-0.2002,0,
      ]));
      const time = this.reducedMotion ? 0 : now / 1000;
      gl.uniform1f(this.uniforms.Time, time);
      const space = this.environment === "star-wars";
      const hell = this.environment === "hell-support";
      gl.uniform1f(this.uniforms.Space, space ? 1 : 0);
      gl.uniform1f(this.uniforms.Hell, hell ? 1 : 0);
      if (hell) {
        this.draw(this.sphere, [0, -1.65, 0], [5.3, 0.28, 3.6], [0.89, 0.28, 0.07]);
        for (let i = 0; i < 9; i++) {
          const x = Math.sin(i * 12.3) * 4;
          const z = Math.cos(i * 8.7) * 2.5;
          this.draw(this.sphere, [x, -1.37 + Math.sin(time * 2 + i) * 0.04, z], [0.14, 0.07, 0.14], [1, 0.72, 0.23]);
        }
      } else if (!space) {
        this.draw(this.sphere, [0, -1.65, 0], [5.3, 0.28, 3.6], [0.56, 0.67, 0.48]);
        for (let i = 0; i < 13; i++) {
          const x = Math.sin(i * 12.3) * 4;
          const z = Math.cos(i * 8.7) * 2.5;
          this.draw(this.sphere, [x, -1.4, z], [0.2 + i % 3 * 0.08, 0.15, 0.22], [0.36, 0.49, 0.43]);
        }
        for (let i = 0; i < 9; i++) {
          const x = Math.sin(i * 4.1) * 4.1;
          const y = -1.05 + Math.sin(time + i) * 0.035;
          this.draw(this.sphere, [x, y, -2.1], [0.07, 0.5 + i % 3 * 0.12, 0.08], [0.16, 0.49, 0.3]);
        }
      }
      for (const fish of this.fish.values()) {
        const { x, y, z, turn, angle } = this.updateFish(fish, now);
        if (space) this.drawShip(fish, x, y, z, turn, time, angle);
        else if (hell) this.drawCaller(fish, x, y, z, turn, time, angle);
        else this.drawFish(fish, x, y, z, turn, time, angle);
        const screen = this.project(x, y - 0.3, z);
        fish.label.style.left = `${screen.x}px`;
        fish.label.style.top = `${screen.y}px`;
        fish.label.style.zIndex = String(Math.round((z + 3) * 10));
        fish.label.style.setProperty("--fish-scale", String(0.9 + (z + 1.6) * 0.08));
        if (fish.caught) {
          const mouth = turn * this.mouthOffset(fish);
          this.rig?.aim(this.project(x + Math.cos(angle) * mouth, y + Math.sin(angle) * mouth + 0.03, z));
        }
      }
      if (this.castState && !this.fish.get(this.castState.name)?.caught) {
        this.rig?.aim(this.project(...this.castState.hook));
      }
      requestAnimationFrame(this.frame);
    }
  }

  window.Pond3D = Pond3D;
})();
