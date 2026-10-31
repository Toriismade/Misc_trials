/* ============================================================
   SIMULATION CONFIGURATION & STATE
   ============================================================ */
const config = {
  tlCount: 4,
  waCount: 4,
  tokensRequired: 12,
  tlSpeed: 2.3,
  waSpeed: 3.2,
  fovAngleDeg: 75,
  fovDistance: 280,
  tardisZoneRadius: 160,
  tardisConsoleRadius: 36,
  manualPlayerMode: false,
  isPaused: false
};

let sim;

/* ============================================================
   VECTOR MATH & COLLISION HELPERS
   ============================================================ */
function isAngleInSector(targetAngle, centerAngle, halfArc) {
  let diff = targetAngle - centerAngle;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return Math.abs(diff) <= halfArc;
}

/* ============================================================
   TIME LORD ENTITY
   ============================================================ */
class TimeLord {
  constructor(id, x, y, isManual = false) {
    this.id = id;
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.heading = random(TWO_PI);
    this.hp = 3;
    this.radius = 14;
    this.isManual = isManual;
    this.carryingToken = null;
    this.isDead = false;
    this.shareEnergyCooldown = 0;
    this.wanderAngle = random(TWO_PI);
  }

  update() {
    if (this.isDead) return;

    if (this.shareEnergyCooldown > 0) this.shareEnergyCooldown--;

    if (this.isManual) {
      // Manual WASD Player Control
      let moveVec = createVector(0, 0);
      if (keyIsDown(87) || keyIsDown(UP_ARROW)) moveVec.y -= 1;
      if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) moveVec.y += 1;
      if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) moveVec.x -= 1;
      if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) moveVec.x += 1;

      if (moveVec.magSq() > 0) {
        moveVec.normalize().mult(config.tlSpeed);
        this.pos.add(moveVec);
      }

      // Orient toward cursor
      const m = createVector(mouseX - width / 2, mouseY - height / 2);
      const relPos = p5.Vector.sub(m, this.pos);
      this.heading = relPos.heading();

    } else {
      // Autonomous AI Routine
      this.runAutonomousAI();
    }

    // Clamp to arena bounds
    const maxBound = min(width, height) * 0.47;
    if (this.pos.mag() > maxBound) {
      this.pos.setMag(maxBound);
    }

    // Auto-transfer energy to critical allies in range
    this.evaluateEnergySharing();
  }

  runAutonomousAI() {
    let desired = createVector(0, 0);
    const center = createVector(0, 0);

    if (this.carryingToken) {
      // Return token to central TARDIS console
      desired = p5.Vector.sub(center, this.pos);
      desired.setMag(config.tlSpeed);
      this.heading = desired.heading();
    } else {
      // Find nearest available token
      let closestToken = null;
      let minDist = Infinity;

      for (let tok of sim.tokens) {
        if (!tok.carriedBy && !tok.deposited) {
          let d = p5.Vector.dist(this.pos, tok.pos);
          if (d < minDist) {
            minDist = d;
            closestToken = tok;
          }
        }
      }

      if (closestToken) {
        desired = p5.Vector.sub(closestToken.pos, this.pos);
        desired.setMag(config.tlSpeed);

        // Gaze priority: aim FOV cone toward the closest stalking angel
        let closestAngel = null;
        let minADist = Infinity;
        for (let a of sim.angels) {
          let ad = p5.Vector.dist(this.pos, a.pos);
          if (ad < minADist) {
            minADist = ad;
            closestAngel = a;
          }
        }

        if (closestAngel && minADist < config.fovDistance * 1.1) {
          let angelDir = p5.Vector.sub(closestAngel.pos, this.pos);
          this.heading = angelDir.heading();
        } else {
          this.heading = desired.heading();
        }
      } else {
        // Idle wander inside sanctuary
        this.wanderAngle += random(-0.2, 0.2);
        desired = p5.Vector.fromAngle(this.wanderAngle).mult(config.tlSpeed * 0.5);
        this.heading = this.wanderAngle;
      }
    }

    // Separation from other Time Lords
    let sep = createVector(0, 0);
    for (let other of sim.timeLords) {
      if (other !== this && !other.isDead) {
        let d = p5.Vector.dist(this.pos, other.pos);
        if (d < this.radius * 2.5 && d > 0) {
          let diff = p5.Vector.sub(this.pos, other.pos).normalize().div(d);
          sep.add(diff);
        }
      }
    }
    sep.mult(1.5);
    desired.add(sep);

    if (desired.magSq() > 0) {
      desired.setMag(config.tlSpeed);
      this.pos.add(desired);
    }
  }

  evaluateEnergySharing() {
    if (this.hp <= 1 || this.shareEnergyCooldown > 0) return;

    for (let ally of sim.timeLords) {
      if (ally !== this && !ally.isDead && ally.hp === 1) {
        let d = p5.Vector.dist(this.pos, ally.pos);
        if (d < 45) {
          this.hp--;
          ally.hp++;
          this.shareEnergyCooldown = 180; // 3 second cooldown
          sim.triggerEnergyTransferFx(this.pos, ally.pos);
          break;
        }
      }
    }
  }

  draw() {
    if (this.isDead) {
      // Dead marker / gravestone
      push();
      translate(this.pos.x, this.pos.y);
      stroke(255, 51, 102, 100);
      strokeWeight(2);
      line(-6, -6, 6, 6);
      line(-6, 6, 6, -6);
      pop();
      return;
    }

    push();
    translate(this.pos.x, this.pos.y);

    // Draw Field of View Cone (disabled if carrying a token)
    if (!this.carryingToken) {
      const halfAngle = radians(config.fovAngleDeg / 2);
      noStroke();
      fill(0, 240, 255, 25);
      arc(0, 0, config.fovDistance * 2, config.fovDistance * 2, this.heading - halfAngle, this.heading + halfAngle, PIE);

      // Vision boundary rays
      stroke(0, 240, 255, 90);
      strokeWeight(1);
      line(0, 0, cos(this.heading - halfAngle) * config.fovDistance, sin(this.heading - halfAngle) * config.fovDistance);
      line(0, 0, cos(this.heading + halfAngle) * config.fovDistance, sin(this.heading + halfAngle) * config.fovDistance);
    }

    // Draw Time Lord Avatar
    rotate(this.heading);

    // Outer glow
    noFill();
    stroke(0, 240, 255, 120);
    strokeWeight(1.5);
    circle(0, 0, this.radius * 2 + 4);

    // Body
    fill(10, 30, 50);
    stroke(0, 240, 255);
    strokeWeight(2);
    circle(0, 0, this.radius * 2);

    // Facing directional notch
    fill(0, 240, 255);
    noStroke();
    triangle(this.radius, 0, this.radius - 6, -4, this.radius - 6, 4);

    // Carrying indicator: Blindness symbol / token on back
    if (this.carryingToken) {
      fill(255, 255, 255);
      stroke(0, 240, 255);
      strokeWeight(2);
      circle(0, 0, 10);
    }

    pop();

    // HP Pips floating above entity
    this.renderHpAbove();
  }

  renderHpAbove() {
    push();
    translate(this.pos.x, this.pos.y - this.radius - 12);
    const pipSize = 4;
    const totalW = 3 * pipSize + 2 * 3;
    let startX = -totalW / 2;

    for (let i = 0; i < 3; i++) {
      if (i < this.hp) {
        fill(245, 166, 35);
        stroke(255, 215, 0);
      } else {
        fill(40, 40, 50);
        stroke(70, 70, 80);
      }
      strokeWeight(1);
      rect(startX + i * (pipSize + 3), 0, pipSize, pipSize, 1);
    }
    pop();
  }
}

/* ============================================================
   WEEPING ANGEL ENTITY
   ============================================================ */
class WeepingAngel {
  constructor(id, x, y) {
    this.id = id;
    this.pos = createVector(x, y);
    this.radius = 15;
    this.isGazed = false;
    this.freezeCooldown = 0; // 10 seconds (600 frames) after feeding
  }

  update() {
    if (this.freezeCooldown > 0) {
      this.freezeCooldown--;
    }

    // An Angel is completely frozen if observed by ANY active TL's FOV or digestive cooldown
    if (this.isGazed || this.freezeCooldown > 0) {
      return; // Quantum Locked!
    }

    // Hunt closest living Time Lord (prioritizing vulnerable/carrying ones)
    let target = null;
    let minScore = Infinity;

    for (let tl of sim.timeLords) {
      if (!tl.isDead) {
        let d = p5.Vector.dist(this.pos, tl.pos);
        let score = d;
        if (tl.carryingToken) score *= 0.6; // Higher priority for blind TL
        if (score < minScore) {
          minScore = score;
          target = tl;
        }
      }
    }

    if (target) {
      let desired = p5.Vector.sub(target.pos, this.pos);
      desired.setMag(config.waSpeed);
      this.pos.add(desired);

      // Attack / Touch Time Lord
      if (p5.Vector.dist(this.pos, target.pos) < this.radius + target.radius) {
        this.attack(target);
      }
    }
  }

  attack(tl) {
    tl.hp--;
    this.freezeCooldown = 600; // Freeze for 10s (600 frames at 60fps)
    sim.triggerAttackFx(this.pos);

    if (tl.hp <= 0) {
      tl.isDead = true;
      if (tl.carryingToken) {
        tl.carryingToken.carriedBy = null;
        tl.carryingToken = null;
      }
    }
  }

  draw() {
    push();
    translate(this.pos.x, this.pos.y);

    const isLocked = this.isGazed || this.freezeCooldown > 0;

    if (isLocked) {
      // Quantum locked stone statue appearance
      fill(60, 68, 76);
      stroke(140, 155, 170);
      strokeWeight(2);

      // Stylized stone angel wings (folded inward defensively)
      triangle(-16, -14, -6, 2, -14, 10);
      triangle(16, -14, 6, 2, 14, 10);

      // Stone body
      ellipse(0, 0, this.radius * 2, this.radius * 2.2);

      // Hands covering face icon
      fill(180, 190, 200);
      noStroke();
      circle(-4, -2, 5);
      circle(4, -2, 5);

      // Freeze indicator countdown ring if in 10s digestion
      if (this.freezeCooldown > 0) {
        noFill();
        stroke(255, 51, 102, 150);
        strokeWeight(2);
        let arcLen = map(this.freezeCooldown, 0, 600, 0, TWO_PI);
        arc(0, 0, this.radius * 2 + 10, this.radius * 2 + 10, -HALF_PI, -HALF_PI + arcLen);
      }
    } else {
      // Active stalker predator state (dark stone & menacing wings spread)
      fill(35, 40, 48);
      stroke(255, 51, 102);
      strokeWeight(2);

      // Spread predator wings
      triangle(-22, -18, -4, 0, -12, 14);
      triangle(22, -18, 4, 0, 12, 14);

      // Body
      ellipse(0, 0, this.radius * 2, this.radius * 2.2);

      // Piercing glowing red eyes
      fill(255, 51, 102);
      noStroke();
      circle(-4, -3, 3);
      circle(4, -3, 3);
    }

    pop();
  }
}

/* ============================================================
   TIME ENERGY TOKEN
   ============================================================ */
class Token {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.carriedBy = null;
    this.deposited = false;
    this.pulse = random(TWO_PI);
  }

  update() {
    if (this.deposited) return;

    if (this.carriedBy) {
      this.pos.set(this.carriedBy.pos.x, this.carriedBy.pos.y);
      // Check if carried inside central TARDIS Console
      if (this.pos.mag() < config.tardisConsoleRadius + 10) {
        this.deposited = true;
        this.carriedBy.carryingToken = null;
        this.carriedBy = null;
        sim.onTokenDeposited();
      }
    } else {
      // Token pickup check
      for (let tl of sim.timeLords) {
        if (!tl.isDead && !tl.carryingToken) {
          if (p5.Vector.dist(this.pos, tl.pos) < tl.radius + 12) {
            this.carriedBy = tl;
            tl.carryingToken = this;
            break;
          }
        }
      }
    }
  }

  draw() {
    if (this.deposited || this.carriedBy) return;

    this.pulse += 0.08;
    let glow = sin(this.pulse) * 4 + 8;

    push();
    translate(this.pos.x, this.pos.y);

    noStroke();
    fill(255, 255, 255, 60);
    circle(0, 0, glow + 8);

    fill(255, 255, 255);
    circle(0, 0, 7);
    pop();
  }
}

/* ============================================================
   SIMULATION MANAGER & GAME LOOP
   ============================================================ */
class SimulationManager {
  constructor() {
    this.timeLords = [];
    this.angels = [];
    this.tokens = [];
    this.particles = [];
    this.depositedCount = 0;
    this.gameState = 'PLAYING'; // 'PLAYING', 'VICTORY_TL', 'VICTORY_WA'

    this.initEntities();
  }

  initEntities() {
    this.timeLords = [];
    this.angels = [];
    this.tokens = [];
    this.particles = [];
    this.depositedCount = 0;
    this.gameState = 'PLAYING';

    const modal = document.getElementById('banner-modal');
    if (modal) modal.classList.remove('active');

    // Spawn Time Lords inside TARDIS sanctuary
    for (let i = 0; i < config.tlCount; i++) {
      let ang = (TWO_PI / config.tlCount) * i;
      let r = random(30, config.tardisZoneRadius * 0.7);
      let tl = new TimeLord(i + 1, cos(ang) * r, sin(ang) * r, i === 0 && config.manualPlayerMode);
      this.timeLords.push(tl);
    }

    // Spawn Weeping Angels outside TARDIS sanctuary
    const maxBound = min(width, height) * 0.44;
    for (let i = 0; i < config.waCount; i++) {
      let ang = (TWO_PI / config.waCount) * i + random(-0.3, 0.3);
      let r = random(config.tardisZoneRadius + 50, maxBound);
      this.angels.push(new WeepingAngel(i + 1, cos(ang) * r, sin(ang) * r));
    }

    // Spawn Required Tokens uniformly in wilderness
    for (let i = 0; i < config.tokensRequired; i++) {
      let ang = random(TWO_PI);
      let r = random(config.tardisZoneRadius + 40, maxBound);
      this.tokens.push(new Token(cos(ang) * r, sin(ang) * r));
    }

    this.updateHUD();
  }

  update() {
    if (config.isPaused || this.gameState !== 'PLAYING') return;

    // 1. Quantum Lock Gaze Assessment
    const halfFov = radians(config.fovAngleDeg / 2);
    for (let angel of this.angels) {
      angel.isGazed = false;
      for (let tl of this.timeLords) {
        // A Time Lord carrying a token is blind (no FOV)
        if (!tl.isDead && !tl.carryingToken) {
          let toAngel = p5.Vector.sub(angel.pos, tl.pos);
          let dist = toAngel.mag();
          if (dist <= config.fovDistance) {
            if (isAngleInSector(toAngel.heading(), tl.heading, halfFov)) {
              angel.isGazed = true;
              break;
            }
          }
        }
      }
    }

    // 2. Update Entities
    for (let tl of this.timeLords) tl.update();
    for (let angel of this.angels) angel.update();
    for (let token of this.tokens) token.update();

    // 3. Update Visual Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].life -= 0.03;
      this.particles[i].pos.add(this.particles[i].vel);
      if (this.particles[i].life <= 0) this.particles.splice(i, 1);
    }

    // 4. Check End Game Conditions
    const livingTLs = this.timeLords.filter(tl => !tl.isDead);
    if (livingTLs.length === 0) {
      this.triggerGameOver('ANGELS WIN', 'All Time Lords succumbed to quantum displacement.', '#ff3366');
    } else if (this.depositedCount >= config.tokensRequired) {
      this.triggerGameOver('TIME LORDS WIN', 'The TARDIS console is fully energized for dematerialization.', '#00f0ff');
    }

    this.updateHUD();
  }

  onTokenDeposited() {
    this.depositedCount++;
    // Pulse particles at console
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        pos: createVector(0, 0),
        vel: p5.Vector.random2D().mult(random(2, 6)),
        color: color(0, 240, 255),
        life: 1.0
      });
    }
  }

  triggerAttackFx(pos) {
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        pos: pos.copy(),
        vel: p5.Vector.random2D().mult(random(1, 4)),
        color: color(255, 51, 102),
        life: 1.0
      });
    }
  }

  triggerEnergyTransferFx(p1, p2) {
    for (let i = 0; i < 12; i++) {
      let lerpVal = random(1);
      let pt = p5.Vector.lerp(p1, p2, lerpVal);
      this.particles.push({
        pos: pt,
        vel: p5.Vector.random2D().mult(0.5),
        color: color(245, 166, 35),
        life: 0.8
      });
    }
  }

  triggerGameOver(title, desc, colorHex) {
    this.gameState = title.includes('TIME LORDS') ? 'VICTORY_TL' : 'VICTORY_WA';
    const modal = document.getElementById('banner-modal');
    const mTitle = document.getElementById('banner-title');
    const mDesc = document.getElementById('banner-desc');

    if (modal && mTitle && mDesc) {
      mTitle.innerText = title;
      mTitle.style.color = colorHex;
      modal.style.borderColor = colorHex;
      mDesc.innerText = desc;
      modal.classList.add('active');
    }
  }

  resetGame() {
    this.initEntities();
  }

  draw() {
    push();
    translate(width / 2, height / 2);

    // Environmental Features
    this.renderEnvironment();

    // Tokens
    for (let token of this.tokens) token.draw();

    // Time Lords & Angels
    for (let tl of this.timeLords) tl.draw();
    for (let angel of this.angels) angel.draw();

    // Particles
    for (let p of this.particles) {
      noStroke();
      fill(red(p.color), green(p.color), blue(p.color), p.life * 255);
      circle(p.pos.x, p.pos.y, 4);
    }

    pop();
  }

  renderEnvironment() {
    // Outer Boundary
    const maxBound = min(width, height) * 0.46;
    noFill();
    stroke(255, 255, 255, 15);
    strokeWeight(2);
    circle(0, 0, maxBound * 2);

    // TARDIS Safe Zone Sanctuary
    fill(0, 240, 255, 4);
    stroke(0, 240, 255, 40);
    strokeWeight(1.5);
    circle(0, 0, config.tardisZoneRadius * 2);

    // Central TARDIS Console
    fill(8, 18, 30);
    stroke(0, 240, 255, 180);
    strokeWeight(2);
    circle(0, 0, config.tardisConsoleRadius * 2);

    // Rotating Console Time Rotor Graphic
    push();
    rotate(frameCount * 0.02);
    noFill();
    stroke(0, 240, 255, 100);
    rectMode(CENTER);
    rect(0, 0, config.tardisConsoleRadius * 1.1, config.tardisConsoleRadius * 1.1);
    pop();

    // Center Beacon
    fill(0, 240, 255, 200 + sin(frameCount * 0.05) * 55);
    noStroke();
    circle(0, 0, 8);
  }

  updateHUD() {
    // Escape Progress Fill
    const ratio = constrain(this.depositedCount / config.tokensRequired, 0, 1);
    const escapeFill = document.getElementById('escape-fill');
    const escapeCount = document.getElementById('escape-count');
    if (escapeFill) escapeFill.style.width = `${ratio * 100}%`;
    if (escapeCount) escapeCount.innerText = `${this.depositedCount} / ${config.tokensRequired}`;

    // Spoils / Vitality Progress
    const living = this.timeLords.filter(t => !t.isDead).length;
    const tlAliveCount = document.getElementById('tl-alive-count');
    if (tlAliveCount) tlAliveCount.innerText = `Active: ${living} / ${this.timeLords.length}`;

    // Roster Elements
    const rosterContainer = document.getElementById('tl-roster-display');
    if (!rosterContainer) return;
    rosterContainer.innerHTML = '';
    for (let tl of this.timeLords) {
      const badge = document.createElement('div');
      badge.className = `tl-badge ${tl.isDead ? 'dead' : ''}`;

      let pipsHtml = '';
      for (let i = 0; i < 3; i++) {
        pipsHtml += `<div class="hp-pip ${i < tl.hp ? '' : 'empty'}"></div>`;
      }

      badge.innerHTML = `
        <span>TL-${tl.id}${tl.isManual ? ' ★' : ''}</span>
        <div class="hp-pips">${pipsHtml}</div>
      `;
      rosterContainer.appendChild(badge);
    }
  }
}

/* ============================================================
   P5.JS LIFECYCLE HOOKS
   ============================================================ */
function setup() {
  const container = document.getElementById('canvas-container');
  const canvas = createCanvas(container.clientWidth, container.clientHeight);
  canvas.parent('canvas-container');
  frameRate(60);

  sim = new SimulationManager();
  window.sim = sim; // Expose globally for restart button
  bindControls();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  if (container) {
    resizeCanvas(container.clientWidth, container.clientHeight);
  }
}

function draw() {
  background(8, 10, 16);
  if (sim) {
    sim.update();
    sim.draw();
  }
}

/* ============================================================
   DOM EVENT BINDING FOR INTERACTIVE HUD
   ============================================================ */
function bindControls() {
  const bindSlider = (id, valId, key, suffix = '', factor = 1) => {
    const slider = document.getElementById(id);
    const display = document.getElementById(valId);
    if (!slider || !display) return;
    slider.addEventListener('input', (e) => {
      config[key] = parseFloat(e.target.value) * factor;
      display.innerText = `${e.target.value}${suffix}`;
    });
  };

  bindSlider('slider-tl', 'val-tl', 'tlCount');
  bindSlider('slider-wa', 'val-wa', 'waCount');
  bindSlider('slider-tokens', 'val-tokens', 'tokensRequired');
  bindSlider('slider-tlspeed', 'val-tlspeed', 'tlSpeed');
  bindSlider('slider-waspeed', 'val-waspeed', 'waSpeed');
  bindSlider('slider-fov', 'val-fov', 'fovAngleDeg', '°');
  bindSlider('slider-fovdist', 'val-fovdist', 'fovDistance', 'px');
  bindSlider('slider-saferad', 'val-saferad', 'tardisZoneRadius', 'px');

  const chkPlayer = document.getElementById('chk-player-mode');
  if (chkPlayer) {
    chkPlayer.addEventListener('change', (e) => {
      config.manualPlayerMode = e.target.checked;
      if (sim && sim.timeLords.length > 0) {
        sim.timeLords[0].isManual = config.manualPlayerMode;
      }
    });
  }

  const restartBtn = document.getElementById('btn-restart');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      if (sim) sim.resetGame();
    });
  }

  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      config.isPaused = !config.isPaused;
      pauseBtn.innerText = config.isPaused ? 'Resume' : 'Pause';
    });
  }
}