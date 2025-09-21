const TWO_PI = Math.PI * 2;

class BloomParticle {
  constructor(x, y, hue) {
    this.x = x;
    this.y = y;
    this.life = Math.random() * 0.6 + 0.6;
    this.age = 0;
    this.size = Math.random() * 18 + 12;
    this.hue = hue;
    this.twist = Math.random() * 0.8 + 0.2;
    this.vx = (Math.random() - 0.5) * 38;
    this.vy = (Math.random() - 0.5) * 28;
  }

  update(dt, attract) {
    this.age += dt;
    const t = Math.min(1, this.age / this.life);
    const curl = this.twist * (1 - t);
    const sinT = Math.sin(this.age * 3 + this.hue);
    this.vx += sinT * curl * 4;
    this.vy -= curl * 6 * dt;

    if (attract) {
      const ax = (attract.x - this.x) * 0.6;
      const ay = (attract.y - this.y) * 0.6;
      this.vx += ax * dt;
      this.vy += ay * dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  get alpha() {
    const t = Math.min(1, this.age / this.life);
    return Math.pow(1 - t, 1.6);
  }

  get alive() {
    return this.age < this.life;
  }
}

export class NeonGardenApp {
  constructor({ canvas, growthControl }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.growthControl = growthControl;
    this.particles = [];
    this.trails = [];
    this.flowField = { angle: 0 };
    this.cursor = null;
    this.lastSpawn = 0;
    this.lastFrame = performance.now();
    this.active = false;
    this.viewWidth = 0;
    this.viewHeight = 0;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.loop = this.loop.bind(this);
  }

  async initialize() {
    this.handleResize();
    window.addEventListener('resize', this.handleResize);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);

    return true;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.active = false;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);
  }

  reset() {
    this.particles.length = 0;
    this.trails.length = 0;
    this.cursor = null;
    this.lastSpawn = 0;
  }

  spawnBurst(x, y) {
    const growth = Number.parseFloat(this.growthControl?.value ?? '0.5');
    const count = Math.floor(80 + growth * 140);
    for (let i = 0; i < count; i += 1) {
      const hue = (growth * 180 + Math.random() * 120) / 360;
      this.particles.push(new BloomParticle(x, y, hue));
    }
  }

  handlePointerDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.viewWidth;
    const y = ((event.clientY - rect.top) / rect.height) * this.viewHeight;
    this.cursor = { x, y, active: true };
    this.spawnBurst(x, y);
  }

  handlePointerMove(event) {
    if (!this.cursor && event.buttons === 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.viewWidth;
    const y = ((event.clientY - rect.top) / rect.height) * this.viewHeight;
    if (this.cursor) {
      this.cursor.x = x;
      this.cursor.y = y;
    } else if (event.buttons & 1) {
      this.cursor = { x, y, active: true };
    }
    this.trails.push({ x, y, life: 0.6 });
  }

  handlePointerUp() {
    if (this.cursor) {
      this.cursor.active = false;
    }
  }

  handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth || this.canvas.offsetWidth || 800;
    const height = this.canvas.clientHeight || this.canvas.offsetHeight || 600;
    this.pixelRatio = dpr;
    this.viewWidth = width;
    this.viewHeight = height;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  loop(now) {
    if (!this.active) return;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;

    this.update(dt);
    this.render();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.flowField.angle += dt * 0.4;
    const attract = this.cursor?.active ? this.cursor : null;

    this.particles.forEach((particle) => particle.update(dt, attract));
    this.particles = this.particles.filter((particle) => particle.alive);

    const decay = dt * 1.5;
    this.trails.forEach((trail) => {
      trail.life -= decay;
    });
    this.trails = this.trails.filter((trail) => trail.life > 0);

    if (this.cursor?.active) {
      this.lastSpawn += dt;
      const growth = Number.parseFloat(this.growthControl?.value ?? '0.5');
      const spawnDelay = 0.08 - growth * 0.05;
      if (this.lastSpawn > spawnDelay) {
        this.lastSpawn = 0;
        this.spawnBurst(this.cursor.x, this.cursor.y);
      }
    }
  }

  render() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(3, 6, 15, 0.35)';
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    ctx.save();
    ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
    ctx.scale(1, 0.8);
    ctx.rotate(Math.sin(this.flowField.angle) * 0.02);
    ctx.translate(-this.viewWidth / 2, -this.viewHeight / 2);

    ctx.globalCompositeOperation = 'lighter';
    for (const trail of this.trails) {
      const alpha = Math.max(0, trail.life);
      ctx.fillStyle = `rgba(100, 180, 255, ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, 12 * alpha + 6, 0, TWO_PI);
      ctx.fill();
    }

    for (const particle of this.particles) {
      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.size);
      const hue = Math.floor(particle.hue * 360);
      gradient.addColorStop(0, `hsla(${hue}, 95%, 65%, ${particle.alpha})`);
      gradient.addColorStop(0.6, `hsla(${(hue + 30) % 360}, 85%, 55%, ${particle.alpha * 0.6})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, TWO_PI);
      ctx.fill();
    }

    ctx.restore();
  }
}
