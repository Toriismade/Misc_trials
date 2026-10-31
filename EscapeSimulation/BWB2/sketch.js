/**
 * Before We Blink - Oceanic Abyss Simulation
 * Plan A: Adjustable Conditions (Behance Oceanic & Chartreuse Palette)
 */

let sim;

/* ==========================================================================
   CLASS: TIME LORD (V1 Minimalist Geometric Disc with White/Aqua Accents)
   ========================================================================== */
class TimeLord {
  constructor(id, x, y, isPlayer = false) {
    this.id = id;
    this.pos = createVector(x, y);
    this.heading = random(TWO_PI);
    this.hp = 3;
    this.radius = 16;
    this.isPlayer = isPlayer;
    this.carryingToken = null;
    this.isDead = false;
    this.shareCooldown = 0;
    this.wanderAngle = random(TWO_PI);
  }

  update(manager) {
    if (this.isDead) return;
    if (this.shareCooldown > 0) this.shareCooldown--;

    if (this.isPlayer) {
      // Manual Player Steer (WASD / Arrows)
      let move = createVector(0, 0);
      if (keyIsDown(87) || keyIsDown(UP_ARROW)) move.y -= 1;
      if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) move.y += 1;
      if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) move.x -= 1;
      if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) move.x += 1;

      if (move.magSq() > 0) {
        move.normalize().mult(manager.config.tlSpeed);
        this.pos.add(move);
        manager.addWaterRipple(this.pos, 10, color(56, 216, 255, 90));
      }

      // Cursor Aiming
      let mouseVec = createVector(mouseX - width / 2, mouseY - height / 2);
      this.heading = p5.Vector.sub(mouseVec, this.pos).heading();
    } else {
      this.runAutonomousAI(manager);
    }

    // Circular Arena Perimeter Bounds
    const maxBound = min(width, height) * 0.46;
    if (this.pos.mag() > maxBound) {
      this.pos.setMag(maxBound);
    }

    // Energy Sharing Logic
    this.checkEnergyShare(manager);
  }

  runAutonomousAI(manager) {
    let desired = createVector(0, 0);

    if (this.carryingToken) {
      // Deliver payload to central TARDIS Console
      desired = p5.Vector.sub(createVector(0, 0), this.pos);
      desired.setMag(manager.config.tlSpeed);
      this.heading = desired.heading();
    } else {
      // Seek closest free firefly token
      let closestToken = null;
      let minDist = Infinity;
      for (let tok of manager.tokens) {
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
        desired.setMag(manager.config.tlSpeed);

        // Sightline priority: gaze at closest approaching Angel
        let closestAngel = null;
        let minADist = Infinity;
        for (let a of manager.angels) {
          let ad = p5.Vector.dist(this.pos, a.pos);
          if (ad < minADist) {
            minADist = ad;
            closestAngel = a;
          }
        }

        if (closestAngel && minADist < manager.config.fovDistance * 1.1) {
          this.heading = p5.Vector.sub(closestAngel.pos, this.pos).heading();
        } else {
          this.heading = desired.heading();
        }
      } else {
        // Idle wander
        this.wanderAngle += random(-0.25, 0.25);
        desired = p5.Vector.fromAngle(this.wanderAngle).mult(manager.config.tlSpeed * 0.4);
        this.heading = this.wanderAngle;
      }
    }

    // Flocking Separation from Squad
    let separation = createVector(0, 0);
    for (let other of manager.timeLords) {
      if (other !== this && !other.isDead) {
        let d = p5.Vector.dist(this.pos, other.pos);
        if (d < this.radius * 2.5 && d > 0) {
          separation.add(p5.Vector.sub(this.pos, other.pos).normalize().div(d));
        }
      }
    }
    desired.add(separation.mult(2.2));

    if (desired.magSq() > 0) {
      desired.setMag(manager.config.tlSpeed);
      this.pos.add(desired);
      if (frameCount % 6 === 0) {
        manager.addWaterRipple(this.pos, 8, color(56, 216, 255, 60));
      }
    }
  }

  checkEnergyShare(manager) {
    if (this.hp <= 1 || this.shareCooldown > 0) return;

    for (let ally of manager.timeLords) {
      if (ally !== this && !ally.isDead && ally.hp === 1) {
        if (p5.Vector.dist(this.pos, ally.pos) < 48) {
          this.hp--;
          ally.hp++;
          this.shareCooldown = 200; // ~3.3s
          manager.addParticleBeam(this.pos, ally.pos, color(210, 255, 23));
          break;
        }
      }
    }
  }

  draw(manager) {
    if (this.isDead) {
      push();
      translate(this.pos.x, this.pos.y);
      noStroke();
      fill(22, 26, 66, 180);
      circle(0, 0, this.radius * 2);
      stroke(206, 216, 234, 180);
      strokeWeight(2.5);
      line(-6, -6, 6, 6);
      line(-6, 6, 6, -6);
      pop();
      return;
    }

    push();
    translate(this.pos.x, this.pos.y);

    // 1. LUMINOUS WATERY CYAN FOV CONE
    // Carrying a token disables FOV completely!
    if (!this.carryingToken) {
      const halfAngle = radians(manager.config.fovAngle / 2);
      noStroke();

      // Soft radial watery cyan fan
      fill(56, 216, 255, 55);
      arc(0, 0, manager.config.fovDistance * 2, manager.config.fovDistance * 2, this.heading - halfAngle, this.heading + halfAngle, PIE);

      // Bright translucent edge rim
      stroke(92, 225, 230, 180);
      strokeWeight(1.5);
      drawingContext.setLineDash([4, 4]);
      line(0, 0, cos(this.heading - halfAngle) * manager.config.fovDistance, sin(this.heading - halfAngle) * manager.config.fovDistance);
      line(0, 0, cos(this.heading + halfAngle) * manager.config.fovDistance, sin(this.heading + halfAngle) * manager.config.fovDistance);
      drawingContext.setLineDash([]);
    }

    // 2. V1 DISC (Electric Sky Cyan with Crisp White Accents)
    rotate(this.heading);

    // Soft water shadow underneath
    noStroke();
    fill(9, 32, 85, 120);
    circle(2, 3, this.radius * 2);

    // Main electric cyan disc (#38D8FF)
    fill(56, 216, 255);
    stroke(16, 32, 64);
    strokeWeight(2);
    circle(0, 0, this.radius * 2);

    // White belly / front rim highlight (Reference character style)
    fill(255, 255, 255);
    noStroke();
    arc(0, 0, this.radius * 1.6, this.radius * 1.6, -HALF_PI * 0.8, HALF_PI * 0.8);

    // Crisp forward heading marker / nose
    fill(255, 255, 255);
    stroke(16, 32, 64);
    strokeWeight(1.5);
    triangle(this.radius + 6, 0, this.radius - 2, -4, this.radius - 2, 4);

    // Cute dark ink eyes
    fill(16, 32, 64);
    noStroke();
    circle(3, -4, 3.5);
    circle(3, 4, 3.5);
    fill(255, 255, 255);
    circle(4, -5, 1.2);
    circle(4, 3, 1.2);

    // 3. V1 CARRY STATUS: Firefly payload held in center
    if (this.carryingToken) {
      noFill();
      stroke(210, 255, 23); // Neon chartreuse carry halo
      strokeWeight(2);
      circle(0, 0, this.radius * 2 + 6);

      // Docked glowing firefly spore
      fill(255, 223, 80);
      stroke(255, 255, 255);
      strokeWeight(1.5);
      circle(0, 0, 11);
    }

    pop();

    // 4. Overhead HP Pips
    this.drawHP();
  }

  drawHP() {
    push();
    translate(this.pos.x, this.pos.y - this.radius - 12);
    const pipSize = 5;
    const spacing = 3;
    const totalW = (3 * pipSize) + (2 * spacing);
    let startX = -totalW / 2;

    for (let i = 0; i < 3; i++) {
      if (i < this.hp) {
        fill(56, 216, 255);
        stroke(16, 32, 64);
      } else {
        fill(14, 38, 92);
        stroke(60, 90, 140);
      }
      strokeWeight(1);
      ellipse(startX + i * (pipSize + spacing) + pipSize / 2, 0, pipSize, pipSize);
    }
    pop();
  }
}

/* ==========================================================================
   CLASS: WEEPING ANGEL (Shadowed Indigo Rock Stalker)
   ========================================================================== */
class WeepingAngel {
  constructor(id, x, y) {
    this.id = id;
    this.pos = createVector(x, y);
    this.radius = 16;
    this.isLocked = false;
    this.freezeCooldown = 0; // 600 frames = 10s cooldown
  }

  update(manager) {
    if (this.freezeCooldown > 0) {
      this.freezeCooldown--;
    }

    if (this.isLocked || this.freezeCooldown > 0) {
      return; // Quantum Locked!
    }

    // Stalk closest unobserved Time Lord (prioritize blind carrying ones)
    let target = null;
    let minScore = Infinity;

    for (let tl of manager.timeLords) {
      if (!tl.isDead) {
        let d = p5.Vector.dist(this.pos, tl.pos);
        let score = d;
        if (tl.carryingToken) score *= 0.65;
        if (score < minScore) {
          minScore = score;
          target = tl;
        }
      }
    }

    if (target) {
      let desired = p5.Vector.sub(target.pos, this.pos);
      desired.setMag(manager.config.waSpeed);
      this.pos.add(desired);

      if (p5.Vector.dist(this.pos, target.pos) < this.radius + target.radius) {
        this.attack(target, manager);
      }
    }
  }

  attack(tl, manager) {
    tl.hp--;
    this.freezeCooldown = 600; // 10 seconds freeze
    manager.addExplosion(this.pos, color(56, 216, 255));

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

    const isFrozen = this.isLocked || this.freezeCooldown > 0;

    if (isFrozen) {
      // QUANTUM-LOCKED: Matte stone navy with chalky blue edge rim highlights (#2D3A7A)
      fill(32, 38, 82);
      stroke(206, 216, 234);
      strokeWeight(1.8);

      // Folded Stone Wings
      beginShape();
      vertex(-8, -4);
      vertex(-20, -14);
      vertex(-14, 8);
      vertex(-6, 2);
      endShape(CLOSE);

      beginShape();
      vertex(8, -4);
      vertex(20, -14);
      vertex(14, 8);
      vertex(6, 2);
      endShape(CLOSE);

      // Stone statue core
      ellipse(0, 0, this.radius * 2, this.radius * 2.2);

      // Chalky rock face / covering hands
      fill(45, 58, 122);
      noStroke();
      ellipse(-5, -2, 6, 6);
      ellipse(5, -2, 6, 6);

      // 10s Radial Countdown Ring (Chartreuse)
      if (this.freezeCooldown > 0) {
        noFill();
        stroke(210, 255, 23);
        strokeWeight(2.5);
        let arcLen = map(this.freezeCooldown, 0, 600, 0, TWO_PI);
        arc(0, 0, this.radius * 2 + 12, this.radius * 2 + 12, -HALF_PI, -HALF_PI + arcLen);
      }
    } else {
      // ACTIVE STALKING: Midnight indigo rock (#161A42)
      fill(22, 26, 66);
      stroke(56, 216, 255, 180); // Electric cyan outline glow
      strokeWeight(2);

      // Extended Predatory Wings
      beginShape();
      vertex(-6, 0);
      vertex(-24, -16);
      vertex(-10, 12);
      endShape(CLOSE);

      beginShape();
      vertex(6, 0);
      vertex(24, -16);
      vertex(10, 12);
      endShape(CLOSE);

      ellipse(0, 0, this.radius * 2, this.radius * 2);

      // Glowing Cyan predatory eyes
      fill(56, 216, 255);
      noStroke();
      circle(-4, -4, 3.5);
      circle(4, -4, 3.5);
    }

    pop();
  }
}

/* ==========================================================================
   CLASS: TOKEN (Glowing Firefly Spore)
   ========================================================================== */
class Token {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.carriedBy = null;
    this.deposited = false;
    this.pulse = random(TWO_PI);
    this.orbitAngle = random(TWO_PI);
  }

  update(manager) {
    if (this.deposited) return;

    if (this.carriedBy) {
      this.pos.set(this.carriedBy.pos.x, this.carriedBy.pos.y);

      // Deposit check into TARDIS Console
      if (manager.console.containsPoint(this.pos)) {
        this.deposited = true;
        this.carriedBy.carryingToken = null;
        this.carriedBy = null;
        manager.onTokenBanked();
      }
    } else {
      // Ambient bobbing
      this.orbitAngle += 0.03;

      // Pickup check
      for (let tl of manager.timeLords) {
        if (!tl.isDead && !tl.carryingToken) {
          if (p5.Vector.dist(this.pos, tl.pos) < tl.radius + 14) {
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
    let glow = sin(this.pulse) * 4 + 18;

    push();
    translate(this.pos.x, this.pos.y + sin(this.orbitAngle) * 3);

    // Soft warm butter-gold halo
    noStroke();
    fill(255, 223, 80, 50);
    circle(0, 0, glow + 10);
    fill(255, 201, 38, 90);
    circle(0, 0, glow);

    // Glowing core
    fill(255, 255, 255);
    stroke(255, 223, 80);
    strokeWeight(2);
    circle(0, 0, 8);
    pop();
  }
}

/* ==========================================================================
   CLASS: TARDIS CONSOLE (Stepping Stone Plinth with Neon Chartreuse Top)
   ========================================================================== */
class TARDISConsole {
  constructor(radius = 42) {
    this.radius = radius;
  }

  containsPoint(pos) {
    return pos.mag() < this.radius + 6;
  }

  draw(manager) {
    const safeRadius = manager.config.sanctuaryRadius;

    // 1. Outer Sanctuary Boundary: Water Ripples & Stepping Ring
    noFill();
    stroke(56, 216, 255, 70);
    strokeWeight(2);
    drawingContext.setLineDash([8, 6]);
    circle(0, 0, safeRadius * 2);
    drawingContext.setLineDash([]);

    // Water ripple ring
    stroke(255, 255, 255, 40);
    strokeWeight(1.5);
    circle(0, 0, safeRadius * 2 + 12);

    // 2. Stepping Stone Base Plinth (Chalky White Marble with Chiseled Edge)
    fill(154, 174, 199); // Darker base shade
    noStroke();
    circle(0, 4, this.radius * 2);

    fill(206, 216, 234); // Pale marble rock side
    stroke(16, 32, 64);
    strokeWeight(2.5);
    circle(0, 2, this.radius * 2);

    // 3. Console Surface: Luminous Neon Chartreuse Top (#D2FF17)
    fill(210, 255, 23);
    stroke(186, 242, 0);
    strokeWeight(2);
    circle(0, -1, this.radius * 1.8);

    // Stepping Stone Cracks / Grass Texture Details
    stroke(16, 32, 64, 80);
    strokeWeight(1.5);
    line(-12, -4, -4, 2);
    line(-4, 2, 8, -6);
    line(4, 6, 12, 10);

    // Central Pulsing Energy Rotor
    fill(255, 255, 255);
    stroke(56, 216, 255);
    strokeWeight(2);
    let pulse = 14 + sin(frameCount * 0.08) * 3;
    circle(0, -1, pulse);
  }
}

/* ==========================================================================
   CLASS: SIMULATION MANAGER (Game State & p5 Orchestration)
   ========================================================================== */
class SimulationManager {
  constructor() {
    this.config = {
      tlCount: 4,
      waCount: 4,
      tokensRequired: 12,
      tlSpeed: 2.4,
      waSpeed: 3.4,
      fovAngle: 75,
      fovDistance: 280,
      sanctuaryRadius: 165,
      playerMode: false,
      isPaused: false
    };

    this.console = new TARDISConsole(42);
    this.timeLords = [];
    this.angels = [];
    this.tokens = [];
    this.particles = [];
    this.waterRipples = [];
    this.ambientFireflies = [];
    this.depositedCount = 0;
    this.state = 'INTRO'; // 'INTRO', 'PLAYING', 'TL_VICTORY', 'WA_VICTORY'

    this.initAmbientSparks();
    this.init();
    this.bindDOM();
  }

  initAmbientSparks() {
    this.ambientFireflies = [];
    for (let i = 0; i < 35; i++) {
      this.ambientFireflies.push({
        x: random(-width / 2, width / 2),
        y: random(-height / 2, height / 2),
        size: random(2, 4.5),
        speed: random(0.2, 0.6),
        pulse: random(TWO_PI)
      });
    }
  }

  init() {
    this.timeLords = [];
    this.angels = [];
    this.tokens = [];
    this.particles = [];
    this.waterRipples = [];
    this.depositedCount = 0;
    this.state = 'PLAYING';

    document.getElementById('endgame-modal').classList.add('hidden');

    // Spawn Time Lords inside sanctuary
    for (let i = 0; i < this.config.tlCount; i++) {
      let ang = (TWO_PI / this.config.tlCount) * i;
      let r = random(35, this.config.sanctuaryRadius * 0.65);
      let isManual = (i === 0 && this.config.playerMode);
      this.timeLords.push(new TimeLord(i + 1, cos(ang) * r, sin(ang) * r, isManual));
    }

    // Spawn Weeping Angels outside sanctuary
    const maxBound = min(width, height) * 0.44;
    for (let i = 0; i < this.config.waCount; i++) {
      let ang = (TWO_PI / this.config.waCount) * i + random(-0.2, 0.2);
      let r = random(this.config.sanctuaryRadius + 40, maxBound);
      this.angels.push(new WeepingAngel(i + 1, cos(ang) * r, sin(ang) * r));
    }

    // Scatter Glowing Firefly Tokens
    for (let i = 0; i < this.config.tokensRequired; i++) {
      let ang = random(TWO_PI);
      let r = random(this.config.sanctuaryRadius + 30, maxBound);
      this.tokens.push(new Token(cos(ang) * r, sin(ang) * r));
    }

    this.updateHUD();
  }

  update() {
    if (this.config.isPaused || this.state !== 'PLAYING') return;

    // 1. Line-of-Sight Quantum Lock Calculation
    const halfAngle = radians(this.config.fovAngle / 2);

    for (let angel of this.angels) {
      angel.isLocked = false;

      for (let tl of this.timeLords) {
        // Blinding Rule: Carrying a token disables FOV
        if (!tl.isDead && !tl.carryingToken) {
          let toAngel = p5.Vector.sub(angel.pos, tl.pos);
          let dist = toAngel.mag();

          if (dist <= this.config.fovDistance) {
            let diff = toAngel.heading() - tl.heading;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) <= halfAngle) {
              angel.isLocked = true;
              break;
            }
          }
        }
      }
    }

    // 2. Entity Updates
    for (let tl of this.timeLords) tl.update(this);
    for (let a of this.angels) a.update(this);
    for (let tok of this.tokens) tok.update(this);

    // 3. Particles & Ripples
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].life -= 0.035;
      this.particles[i].pos.add(this.particles[i].vel);
      if (this.particles[i].life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.waterRipples.length - 1; i >= 0; i--) {
      this.waterRipples[i].radius += 1.2;
      this.waterRipples[i].alpha -= 3;
      if (this.waterRipples[i].alpha <= 0) this.waterRipples.splice(i, 1);
    }

    // 4. Win / Loss Checking
    const aliveTLs = this.timeLords.filter(t => !t.isDead);
    if (aliveTLs.length === 0) {
      this.triggerGameOver('ANGELS CONSUMED ALL', 'All Time Lords were drained of their temporal energy. The timeline sank into the abyss.', 'Defeat');
    } else if (this.depositedCount >= this.config.tokensRequired) {
      this.triggerGameOver('TIME LORDS ESCAPED!', 'The TARDIS Console is powered. Safe dematerialization achieved.', 'Victory');
    }

    this.updateHUD();
  }

  onTokenBanked() {
    this.depositedCount++;
    this.addExplosion(createVector(0, 0), color(210, 255, 23));
  }

  addExplosion(pos, col) {
    for (let i = 0; i < 22; i++) {
      this.particles.push({
        pos: pos.copy(),
        vel: p5.Vector.random2D().mult(random(2, 6)),
        color: col,
        life: 1.0
      });
    }
  }

  addWaterRipple(pos, initialRadius, col) {
    this.waterRipples.push({
      x: pos.x,
      y: pos.y,
      radius: initialRadius,
      alpha: 120,
      color: col
    });
  }

  addParticleBeam(p1, p2, col) {
    for (let i = 0; i < 14; i++) {
      let pt = p5.Vector.lerp(p1, p2, random(1));
      this.particles.push({
        pos: pt,
        vel: p5.Vector.random2D().mult(0.6),
        color: col,
        life: 0.8
      });
    }
  }

  triggerGameOver(title, desc, badge) {
    this.state = title.includes('TIME LORDS') ? 'TL_VICTORY' : 'WA_VICTORY';
    const modal = document.getElementById('endgame-modal');
    document.getElementById('endgame-title').innerText = title;
    document.getElementById('endgame-desc').innerText = desc;
    document.getElementById('endgame-badge').innerText = badge;
    modal.classList.remove('hidden');
  }

  draw() {
    push();
    translate(width / 2, height / 2);

    // 1. Ambient Background Fireflies / Ocean Spores
    for (let f of this.ambientFireflies) {
      f.pulse += 0.05;
      f.y -= f.speed;
      if (f.y < -height / 2) f.y = height / 2;
      noStroke();
      fill(255, 223, 80, 50 + sin(f.pulse) * 35);
      circle(f.x, f.y, f.size);
    }

    // 2. Water Ripples
    for (let r of this.waterRipples) {
      noFill();
      stroke(red(r.color), green(r.color), blue(r.color), r.alpha);
      strokeWeight(1.5);
      circle(r.x, r.y, r.radius * 2);
    }

    // 3. Arena Outer Boundary
    const arenaBound = min(width, height) * 0.46;
    noFill();
    stroke(56, 216, 255, 35);
    strokeWeight(3);
    circle(0, 0, arenaBound * 2);

    // 4. Sanctuary & Console
    this.console.draw(this);

    // 5. Firefly Tokens
    for (let tok of this.tokens) tok.draw();

    // 6. Entities
    for (let tl of this.timeLords) tl.draw(this);
    for (let a of this.angels) a.draw();

    // 7. Dynamic Sparks
    for (let p of this.particles) {
      noStroke();
      fill(red(p.color), green(p.color), blue(p.color), p.life * 255);
      circle(p.pos.x, p.pos.y, 5);
    }

    pop();
  }

  updateHUD() {
    const ratio = constrain(this.depositedCount / this.config.tokensRequired, 0, 1);
    document.getElementById('hud-tokens-fill').style.width = `${ratio * 100}%`;
    document.getElementById('hud-tokens-text').innerText = `${this.depositedCount} / ${this.config.tokensRequired} TOKENS`;

    const lockedCount = this.angels.filter(a => a.isLocked || a.freezeCooldown > 0).length;
    document.getElementById('hud-angels-locked').innerText = `${lockedCount} / ${this.angels.length} LOCKED`;

    const aliveCount = this.timeLords.filter(t => !t.isDead).length;
    document.getElementById('hud-tl-summary').innerText = `Time Lords Standing: ${aliveCount} / ${this.timeLords.length}`;

    // V1 HP & Carry Roster
    const container = document.getElementById('tl-vitality-container');
    container.innerHTML = '';
    for (let tl of this.timeLords) {
      const badge = document.createElement('div');
      badge.className = `tl-badge ${tl.isDead ? 'dead' : ''} ${tl.carryingToken ? 'carrying' : ''}`;

      let dotsHtml = '';
      for (let i = 0; i < 3; i++) {
        dotsHtml += `<div class="hp-dot ${i < tl.hp ? '' : 'spent'}"></div>`;
      }

      badge.innerHTML = `
        <span>TL #${tl.id}${tl.isPlayer ? ' (YOU)' : ''}</span>
        ${tl.carryingToken ? '<span class="carrying-chip">CARRIER</span>' : ''}
        <div class="hp-dots">${dotsHtml}</div>
      `;
      container.appendChild(badge);
    }
  }

  bindDOM() {
    const bindSlider = (id, valId, key, suffix = '') => {
      const slider = document.getElementById(id);
      const label = document.getElementById(valId);
      slider.addEventListener('input', (e) => {
        this.config[key] = parseFloat(e.target.value);
        label.innerText = `${e.target.value}${suffix}`;
      });
    };

    bindSlider('slider-tl-count', 'val-tl-count', 'tlCount');
    bindSlider('slider-wa-count', 'val-wa-count', 'waCount');
    bindSlider('slider-tokens', 'val-tokens', 'tokensRequired');
    bindSlider('slider-tl-speed', 'val-tl-speed', 'tlSpeed');
    bindSlider('slider-wa-speed', 'val-wa-speed', 'waSpeed');
    bindSlider('slider-fov-angle', 'val-fov-angle', 'fovAngle', '°');
    bindSlider('slider-fov-dist', 'val-fov-dist', 'fovDistance', 'px');
    bindSlider('slider-safe-radius', 'val-safe-radius', 'sanctuaryRadius', 'px');

    const chkPlayer = document.getElementById('chk-player-mode');
    chkPlayer.addEventListener('change', (e) => {
      this.config.playerMode = e.target.checked;
      if (this.timeLords.length > 0) {
        this.timeLords[0].isPlayer = this.config.playerMode;
      }
    });

    document.getElementById('btn-restart').addEventListener('click', () => this.init());
    document.getElementById('btn-replay').addEventListener('click', () => this.init());

    // Scenario Intro Modal Start CTA
    document.getElementById('btn-start-mission').addEventListener('click', () => {
      document.getElementById('intro-modal').classList.add('hidden');
      this.state = 'PLAYING';
    });

    const pauseBtn = document.getElementById('btn-pause');
    pauseBtn.addEventListener('click', () => {
      this.config.isPaused = !this.config.isPaused;
      pauseBtn.innerText = this.config.isPaused ? 'Resume' : 'Pause';
    });
  }
}

/* ==========================================================================
   P5.JS LIFECYCLE HOOKS
   ========================================================================== */
function setup() {
  const container = document.getElementById('canvas-container');
  const canvas = createCanvas(container.clientWidth, container.clientHeight);
  canvas.parent('canvas-container');
  frameRate(60);

  sim = new SimulationManager();
}

function windowResized() {
  const container = document.getElementById('canvas-container');
  resizeCanvas(container.clientWidth, container.clientHeight);
  if (sim) sim.initAmbientSparks();
}

function draw() {
  clear();
  sim.update();
  sim.draw();
}