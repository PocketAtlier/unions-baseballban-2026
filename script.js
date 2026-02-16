const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let gameState = { 
    gameStarted: false, inning: 1, score: 0, outs: 0, strikes: 0, 
    bases: [false, false, false], message: "UNIONS BASEBALL 2026", 
    gameOver: false, isShuffling: false, currentPitchSpeed: 3.5,
    pitchTimer: 0, isFirstPitchOfInning: true, countdown: ""
};

// --- AUDIO ENGINE ---
function playSound(type) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playNote = (freq, start, duration, vol = 0.1, wave = 'sine') => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = wave; 
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
        g.gain.setValueAtTime(vol, audioCtx.currentTime + start);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + duration);
        osc.connect(g); g.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + start); 
        osc.stop(audioCtx.currentTime + start + duration);
    };

    switch(type) {
        case 'title': // Corrected intervals and phrasing
            const tempo = 0.3;
            const notes = [
                {f: 261.6, d: 0.5}, {f: 523.2, d: 0.3}, {f: 440.0, d: 0.5}, 
                {f: 392.0, d: 0.3}, {f: 329.6, d: 0.5}, {f: 392.0, d: 0.8},
                {f: 261.6, d: 0.5}, {f: 523.2, d: 0.3}, {f: 440.0, d: 0.5}, 
                {f: 392.0, d: 0.3}, {f: 587.3, d: 0.9}
            ];
            notes.forEach((n, i) => {
                let phrasingDelay = i > 5 ? 0.2 : 0;
                playNote(n.f, (i * tempo) + phrasingDelay, n.d, 0.1, 'triangle');
            });
            break;
        case 'pitch': playNote(150, 0, 0.2, 0.05, 'sine'); break;
        case 'hit': playNote(400, 0, 0.15, 0.2, 'triangle'); playNote(200, 0.02, 0.1, 0.2, 'sine'); break;
        case 'out': [330, 261, 196].forEach((f, i) => playNote(f, i*0.15, 0.2, 0.1)); break;
        case 'baseHit': [392, 440, 523].forEach((f, i) => playNote(f, i*0.1, 0.2, 0.1)); break;
        case 'hr': [523, 659, 783, 1046].forEach((f, i) => playNote(f, i*0.1, 0.4, 0.1, 'sawtooth')); break;
        case 'score': playNote(1200, 0, 0.1, 0.1); playNote(1500, 0.05, 0.2, 0.1); break;
        case 'gameOver': [261, 196, 130].forEach((f, i) => playNote(f, i*0.5, 0.8, 0.1, 'triangle')); break;
    }
}

const centerX = 400; const centerY = 570; 
const fieldRadius = 520; const spread = 0.75; 
const leftAngle = Math.PI * 1.5 - spread;
const rightAngle = Math.PI * 1.5 + spread;
const infieldDist = 210; 
const baseCoords = [
  { x: centerX + Math.cos(rightAngle) * infieldDist, y: centerY + Math.sin(rightAngle) * infieldDist }, 
  { x: centerX, y: centerY - infieldDist * 1.4 },                                                      
  { x: centerX + Math.cos(leftAngle) * infieldDist, y: centerY + Math.sin(leftAngle) * infieldDist },   
  { x: centerX, y: centerY - 20 }                                                                     
];

let ball = { x: 400, y: 395, r: 8, vx: 0, vy: 0, isMoving: false, hit: false, active: true, scale: 1 };
let friction = 0.99; 
const batDefaultAngle = Math.PI / 2; 
let bat = { x: 350, y: 530, angle: batDefaultAngle, isSwinging: false, swingSpeed: 0.38 };
let activeRunners = []; let isRunning = false;

const bullpen = [{ name: "Tanaka", speed: 3.5 }, { name: "Kimura", speed: 7.0 }, { name: "Otsuka", speed: 10.5 }];
let pitcherQueue = [...bullpen].sort(() => Math.random() - 0.5);

const rosters = [
  ["Ryoken", "Rina", "Ujita", "Junpei", "Daikan", "Kento", "Sachi"],
  ["Daikan", "Ikeda", "Morimi", "Furugen", "Junpei", "Ujita", "Noguchi"],
  ["Junpei", "Sachi", "Ikeda", "Ujita", "Kento", "Rina", "Akiyoshi"]
];
let shuffledRosters = [...rosters].sort(() => Math.random() - 0.5);

const zoneData = [
  { label: "2BH", type: "2B", color: "#fff" }, { label: "1BH", type: "1B", color: "#fff" },
  { label: "3BH", type: "3B", color: "#fff" }, { label: "OUT", type: "OUT", color: "#ff4d4d" },
  { label: "HR", type: "HR", color: "#ffd700" }, { label: "HR", type: "HR", color: "#ffd700" },
  { label: "HR", type: "HR", color: "#ffd700" }, { label: "OUT", type: "OUT", color: "#ff4d4d" },
  { label: "3BH", type: "3B", color: "#fff" }, { label: "1BH", type: "1B", color: "#fff" },
  { label: "2BH", type: "2B", color: "#fff" }
];

let zones = zoneData.map((data, i) => {
  const holeAngle = (Math.PI * 1.5 - spread * 0.88) + (i * (spread * 1.76) / (zoneData.length - 1));
  return { 
    ...data, currentLabel: data.label, currentColor: data.color,
    x: centerX + Math.cos(holeAngle) * 470, y: centerY + Math.sin(holeAngle) * 470,
    w: 55, h: 40, angle: holeAngle + Math.PI/2
  };
});

const fielders = [
  { name: "P", label: "Tanaka", baseX: 400, x: 400, y: 390, w: 18, h: 12, range: 0, isBlinking: false }, 
  { name: "1B", label: "", baseX: 525, x: 525, y: 380, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "2B", label: "", baseX: 460, x: 460, y: 320, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "SS", label: "", baseX: 340, x: 340, y: 320, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "3B", label: "", baseX: 275, x: 275, y: 380, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "LF", label: "", baseX: 250, x: 250, y: 230, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "CF", label: "", baseX: 400, x: 400, y: 185, w: 29, h: 19, range: 30, isBlinking: false },
  { name: "RF", label: "", baseX: 550, x: 550, y: 230, w: 29, h: 19, range: 30, isBlinking: false }
];

function updatePitcher() {
    if (gameState.inning > 3) return;
    let pData = pitcherQueue[gameState.inning - 1];
    fielders[0].label = pData.name; gameState.currentPitchSpeed = pData.speed;
    let currentRoster = shuffledRosters[gameState.inning - 1];
    fielders[1].label = currentRoster[0]; fielders[2].label = currentRoster[1];
    fielders[3].label = currentRoster[2]; fielders[4].label = currentRoster[3];
    fielders[6].label = currentRoster[4]; fielders[5].label = currentRoster[5];
    fielders[7].label = currentRoster[6];
}

function startSlotMachineEffect() {
    gameState.isShuffling = true;
    let count = 0;
    const interval = setInterval(() => {
        zones.forEach(z => { const rand = zoneData[Math.floor(Math.random() * zoneData.length)]; z.currentLabel = rand.label; z.currentColor = "#555"; });
        count++; if (count > 20) { clearInterval(interval); finalizeShuffle(); }
    }, 50);
}

function finalizeShuffle() {
    let types = [...zoneData];
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    zones.forEach((z, i) => { z.label = types[i].label; z.type = types[i].type; z.color = types[i].color; z.currentLabel = z.label; z.currentColor = z.color; });
    updatePitcher(); gameState.isShuffling = false; gameState.message = `VS ${fielders[0].label}!`; gameState.pitchTimer = 0; gameState.isFirstPitchOfInning = true;
}

function isPointInRotatedRect(px, py, rect) {
  const dx = px - rect.x, dy = py - rect.y;
  const rx = dx * Math.cos(-rect.angle || 0) - dy * Math.sin(-rect.angle || 0);
  const ry = dx * Math.sin(-rect.angle || 0) + dy * Math.cos(-rect.angle || 0);
  return (rx > -rect.w/2 && rx < rect.w/2 && ry > -rect.h/2 && ry < rect.h/2);
}

function drawFielderStickman(x, y, label, isBlinking) {
  let color = "#ff8c00"; if (isBlinking) { color = Math.sin(Date.now() * 0.02) > 0 ? "#ff0000" : "#ffffff"; }
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
  ctx.arc(x, y-25, 6, 0, Math.PI*2); ctx.moveTo(x, y-19); ctx.lineTo(x, y-9); 
  ctx.moveTo(x, y-17); ctx.lineTo(x-9, y-11); ctx.moveTo(x, y-17); ctx.lineTo(x+9, y-11);
  ctx.moveTo(x, y-9); ctx.lineTo(x-6, y); ctx.moveTo(x, y-9); ctx.lineTo(x+6, y); ctx.stroke();
  ctx.fillStyle = isBlinking ? color : "#ffcc00"; ctx.font = "bold 20px Arial"; ctx.textAlign = "center";
  ctx.fillText(label, x, y - 40);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); drawField();
  if (gameState.gameStarted && !gameState.gameOver) { updateGame(); updateRunners(); drawRunners(); if (ball.scale > 0) drawBall(); drawBat(); }
  drawUI(); requestAnimationFrame(draw);
}

function drawField() {
  ctx.fillStyle = "#163012"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#9c8163"; ctx.beginPath(); ctx.moveTo(centerX, centerY);
  ctx.lineTo(baseCoords[0].x, baseCoords[0].y); ctx.lineTo(baseCoords[1].x, baseCoords[1].y);
  ctx.lineTo(baseCoords[2].x, baseCoords[2].y); ctx.closePath(); ctx.fill();
  const boxHeight = 55; const boxWidth = 30; const boxY = baseCoords[3].y - (boxHeight / 2); const lineStartY = boxY;
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(centerX - 45, boxY, boxWidth, boxHeight); ctx.strokeRect(centerX + 15, boxY, boxWidth, boxHeight); 
  ctx.strokeStyle = "white"; ctx.lineWidth = 4;
  const leftStartX = centerX + (lineStartY - centerY) * Math.tan(spread);
  ctx.beginPath(); ctx.moveTo(leftStartX, lineStartY); ctx.lineTo(centerX + Math.cos(leftAngle) * fieldRadius, centerY + Math.sin(leftAngle) * fieldRadius); ctx.stroke();
  const rightStartX = centerX - (lineStartY - centerY) * Math.tan(spread);
  ctx.beginPath(); ctx.moveTo(rightStartX, lineStartY); ctx.lineTo(centerX + Math.cos(rightAngle) * fieldRadius, centerY + Math.sin(rightAngle) * fieldRadius); ctx.stroke();
  ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(centerX, centerY, fieldRadius, leftAngle, rightAngle, false); ctx.stroke();
  baseCoords.forEach((base, i) => {
    ctx.save(); ctx.fillStyle = "white"; if (i < 3) { ctx.translate(base.x, base.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-12, -12, 24, 24); } 
    else { ctx.translate(base.x, base.y + 8); ctx.beginPath(); ctx.moveTo(0, 3.5); ctx.lineTo(15.4, -10.5); ctx.lineTo(15.4, -24.5); ctx.lineTo(-15.4, -24.5); ctx.lineTo(-15.4, -10.5); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  });
  zones.forEach(z => {
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(z.angle); ctx.fillStyle = "black"; ctx.fillRect(-z.w/2, -z.h/2, z.w, z.h); ctx.strokeStyle = z.currentColor; ctx.lineWidth = 2; ctx.strokeRect(-z.w/2, -z.h/2, z.w, z.h); ctx.fillStyle = "white"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center"; ctx.fillText(z.currentLabel, 0, 5); ctx.restore();
  });
  const time = Date.now() * 0.002;
  fielders.forEach((f, i) => { if (f.range > 0) { f.x = f.baseX + Math.sin(time + i) * f.range; } ctx.fillStyle = "black"; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.w/2, f.h/2, 0, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = "#ff4d4d"; ctx.lineWidth = 2; ctx.stroke(); drawFielderStickman(f.x, f.y, f.label, f.isBlinking); });
}

function updateGame() {
  if (isRunning || gameState.isShuffling) return;
  if (!ball.isMoving && !gameState.gameOver) {
      gameState.pitchTimer++;
      if (gameState.isFirstPitchOfInning) {
          if (gameState.pitchTimer < 60) gameState.countdown = "3"; else if (gameState.pitchTimer < 120) gameState.countdown = "2"; else if (gameState.pitchTimer < 180) gameState.countdown = "1";
          else { gameState.countdown = ""; gameState.isFirstPitchOfInning = false; ball.isMoving = true; ball.vy = gameState.currentPitchSpeed; playSound('pitch'); gameState.pitchTimer = 0; }
      } else if (gameState.pitchTimer > 60) { ball.isMoving = true; ball.vy = gameState.currentPitchSpeed; playSound('pitch'); gameState.pitchTimer = 0; }
  }
  if (ball.isMoving) {
    ball.x += ball.vx; ball.y += ball.vy; ball.vx *= friction; ball.vy *= friction;
    if (ball.hit && ball.active && Math.abs(ball.vx) + Math.abs(ball.vy) < 0.15) { ball.active = false; gameState.message = "GROUND OUT"; setTimeout(() => processResult("OUT"), 500); }
    if (!ball.hit && ball.y > 600) { gameState.strikes++; if (gameState.strikes >= 3) { gameState.outs++; gameState.strikes = 0; playSound('out'); gameState.message = "STRIKE OUT"; checkInning(); } else { gameState.message = "STRIKE"; } resetPitch(); }
    let distFromCenter = Math.sqrt((ball.x - centerX)**2 + (ball.y - centerY)**2);
    if (distFromCenter > fieldRadius - 18) { let ballAngle = Math.atan2(ball.y - centerY, ball.x - centerX); ball.vx = -Math.cos(ballAngle) * 5; ball.vy = -Math.sin(ballAngle) * 5; }
    const slope = Math.tan(spread); const relativeX = ball.x - centerX; const relativeY = ball.y - centerY;
    if (ball.active && ball.hit && (relativeX > -relativeY * slope || relativeX < relativeY * slope)) { ball.active = false; gameState.message = "FOUL BALL"; if (gameState.strikes < 2) gameState.strikes++; setTimeout(() => resetPitch(), 1000); }
    if (ball.active && ball.hit) checkCollisions();
  }
  if (bat.isSwinging) { bat.angle -= bat.swingSpeed; if (bat.angle < -Math.PI / 2) { bat.isSwinging = false; bat.angle = batDefaultAngle; } }
  if (bat.isSwinging && !ball.hit && ball.y > 480) {
    let batTipX = bat.x + (65 * Math.cos(bat.angle)), batTipY = bat.y + (65 * Math.sin(bat.angle));
    if (Math.sqrt((ball.x - batTipX)**2 + (ball.y - batTipY)**2) < 45) { ball.hit = true; playSound('hit'); let launchAngle = bat.angle - Math.PI / 2; let distFromPivot = Math.sqrt((ball.x - bat.x)**2 + (ball.y - bat.y)**2); let powerMult = distFromPivot > 60 ? 1.1 : 0.6; ball.vx = Math.cos(launchAngle) * 10 * powerMult; ball.vy = Math.sin(launchAngle) * 10 * powerMult; }
  }
}

function checkCollisions() {
  fielders.forEach(f => { if (Math.sqrt((ball.x - f.x)**2 + (ball.y - f.y)**2) < f.w/2) { ball.active = false; f.isBlinking = true; setTimeout(() => f.isBlinking = false, 1000); playSound('out'); animateFall("OUT"); } });
  zones.forEach(z => { 
    if (isPointInRotatedRect(ball.x, ball.y, z)) { 
        ball.active = false; 
        if (z.type === 'HR') playSound('hr'); 
        else if (z.type === 'OUT') playSound('out');
        else playSound('baseHit'); 
        animateFall(z.type); 
    } 
  });
}

function animateFall(type) { let timer = setInterval(() => { ball.scale -= 0.15; if (ball.scale <= 0) { clearInterval(timer); processResult(type); } }, 40); }
function processResult(type) { if (type === "OUT") { gameState.outs++; gameState.message = "OUT"; checkInning(); resetPitch(); } else { startRunnerAnimation(type); } }

function startRunnerAnimation(type) {
  isRunning = true; gameState.message = type === "1B" ? "SINGLE" : type === "2B" ? "DOUBLE" : type === "3B" ? "TRIPLE" : "HOMERUN!";
  let move = (type === "1B") ? 1 : (type === "2B") ? 2 : (type === "3B") ? 3 : (type === "HR") ? 4 : 0;
  activeRunners = [];
  gameState.bases.forEach((occupied, i) => { if (occupied) activeRunners.push({ x: baseCoords[i].x, y: baseCoords[i].y, currentTargetIdx: i, finalTargetIdx: i + move }); });
  activeRunners.push({ x: baseCoords[3].x, y: baseCoords[3].y, currentTargetIdx: -1, finalTargetIdx: move - 1 });
  gameState.bases = [false, false, false];
}

function updateRunners() {
  if (!isRunning) return; let allFinished = true;
  activeRunners.forEach(r => {
    let nextIdx = r.currentTargetIdx + 1; let target = baseCoords[Math.min(nextIdx, 3)]; let dx = target.x - r.x, dy = target.y - r.y, dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 5) { r.x += dx * 0.08; r.y += dy * 0.08; allFinished = false; } else { r.x = target.x; r.y = target.y; if (nextIdx < r.finalTargetIdx) { r.currentTargetIdx = nextIdx; allFinished = false; } }
  });
  if (allFinished) { activeRunners.forEach(r => { if (r.finalTargetIdx >= 3) { gameState.score++; playSound('score'); } else gameState.bases[r.finalTargetIdx] = true; }); activeRunners = []; isRunning = false; setTimeout(() => { checkInning(); resetPitch(); }, 400); }
}

function checkInning() {
  if (gameState.outs >= 3) { gameState.outs = 0; gameState.inning++; gameState.strikes = 0; gameState.bases = [false, false, false]; if (gameState.inning <= 3) { gameState.message = "SHUFFLING FIELD..."; startSlotMachineEffect(); } }
  if (gameState.inning > 3) { gameState.gameOver = true; gameState.message = "GAME OVER"; playSound('gameOver'); }
}

function drawRunners() {
  let list = isRunning ? activeRunners : gameState.bases.map((b, i) => b ? {x: baseCoords[i].x, y: baseCoords[i].y} : null).filter(n => n);
  list.forEach(r => {
    ctx.strokeStyle = "#4cc9f0"; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(r.x, r.y-25, 5, 0, Math.PI*2); ctx.moveTo(r.x, r.y-20); ctx.lineTo(r.x, r.y-10); ctx.moveTo(r.x, r.y-18); ctx.lineTo(r.x-8, r.y-12); ctx.moveTo(r.x, r.y-18); ctx.lineTo(r.x+8, r.y-12); ctx.moveTo(r.x, r.y-10); ctx.lineTo(r.x-5, r.y); ctx.moveTo(r.x, r.y-10); ctx.lineTo(r.x+5, r.y); ctx.stroke();
  });
}

function drawBall() { ctx.globalAlpha = ball.scale; ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * ball.scale, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1.0; }
function drawBat() { ctx.save(); ctx.translate(bat.x, bat.y); ctx.rotate(bat.angle); ctx.fillStyle = "#8b5a2b"; ctx.beginPath(); ctx.roundRect(0, -3, 25, 6, 2); ctx.fill(); ctx.fillStyle = "#bc8f8f"; ctx.beginPath(); ctx.moveTo(25, -3); ctx.lineTo(50, -6); ctx.lineTo(50, 6); ctx.lineTo(25, 3); ctx.fill(); ctx.fillStyle = "#deb887"; ctx.beginPath(); ctx.roundRect(50, -8, 35, 16, 4); ctx.fill(); ctx.restore(); }

function drawUI() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); 
  if (!gameState.gameStarted) {
      ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.font = "bold 60px Arial"; ctx.fillText("Unions Baseball 2026", 400, 200);
      ctx.font = "30px Arial"; ctx.fillText("How to play: Tap to swing bat", 400, 260);
      ctx.font = "bold 50px Arial"; ctx.fillText("Tap to start", 400, 360); return;
  }
  if (gameState.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#ff4d4d"; ctx.textAlign = "center"; ctx.font = "bold 80px Arial"; ctx.fillText("Game Over", 400, 220);
      ctx.fillStyle = "white"; ctx.font = "40px Arial"; ctx.fillText(`Final Score: ${gameState.score}`, 400, 300);
      ctx.font = "30px Arial"; ctx.fillText("Tap to play again", 400, 420); return;
  }
  const uiX = 10; const uiY = 410; const uiWidth = 196;
  ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.strokeStyle = "white"; ctx.lineWidth = 4; ctx.fillRect(uiX, uiY, uiWidth, 180); ctx.strokeRect(uiX, uiY, uiWidth, 180);
  ctx.fillStyle = "white"; ctx.font = "bold 22px Courier New"; ctx.textAlign = "left";
  ctx.fillText(`INNING: ${Math.min(gameState.inning, 3)}/3`, uiX + 15, uiY + 40); ctx.fillText(`OUTS:   ${gameState.outs}/3`, uiX + 15, uiY + 80); ctx.fillText(`STRIKE: ${gameState.strikes}/3`, uiX + 15, uiY + 120);
  ctx.fillStyle = "#ffb703"; ctx.font = "bold 26px Courier New"; ctx.fillText(`SCORE:  ${gameState.score}`, uiX + 15, uiY + 160);
  const rightEdge = canvas.width - 20; const bottomEdge = canvas.height - 20;
  ctx.textAlign = "right"; ctx.fillStyle = "#aaa"; ctx.font = "bold 16px Arial"; ctx.fillText(`Made by Tanaka (mostly AI)`, rightEdge, bottomEdge - 25); ctx.fillText(`Milestone ver: 70`, rightEdge, bottomEdge);
  ctx.font = "bold 42px Arial"; ctx.textAlign = "center"; ctx.fillStyle = "#ffff00"; ctx.shadowColor = "black"; ctx.shadowBlur = 8;
  if (gameState.countdown !== "") { ctx.fillText(gameState.countdown, 400, 300); } else { ctx.fillText(gameState.message, 400, 220); } ctx.shadowBlur = 0;
}

function resetPitch() { ball = { x: 400, y: 395, r: 8, vx: 0, vy: 0, isMoving: false, hit: false, active: true, scale: 1 }; gameState.pitchTimer = 0; }

function handleInput() {
  if (!gameState.gameStarted) { playSound('title'); gameState.gameStarted = true; updatePitcher(); return; }
  if (gameState.gameOver) { location.reload(); return; }
  if (!bat.isSwinging && !isRunning && !gameState.isShuffling) { bat.isSwinging = true; }
}

window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(); }, { passive: false });
draw();
