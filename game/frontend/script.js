// --- GAME STATE ---
const GAME_WIDTH = 1000;
const GAME_HEIGHT = 700;
const PLAYER_SIZE = 40;

const player = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    vx: 0,
    vy: 0,
    speed: 350, // pixels per second
    hp: 0,
    maxHp: 0,
    chargeStacks: 0,
    maxCharge: 3,
    weaknessStacks: 0,
    alive: true
};

const abilities = {
    q: { name: 'Coin Flip', cd: 1750, lastUsed: 0 },
    e: { name: 'One Shot', cd: 1500, lastUsed: 0 },
    r: { name: 'Reroll HP', cd: 1500, lastUsed: 0 },
    t: { name: 'Reset', cd: 1000, lastUsed: 0 }
};

const keys = { w: false, a: false, s: false, d: false };

// --- DOM ELEMENTS ---
const playerEl = document.getElementById('player');
const gameContainer = document.getElementById('game-container');
const healthFill = document.getElementById('health-bar-fill');
const healthText = document.getElementById('health-text');
const chargeCountEl = document.getElementById('charge-count');
const weaknessCountEl = document.getElementById('weakness-count');
const feedbackLayer = document.getElementById('feedback-layer');

const cdOverlays = {
    q: document.querySelector('#ability-q .ability-cd-overlay'),
    e: document.querySelector('#ability-e .ability-cd-overlay'),
    r: document.querySelector('#ability-r .ability-cd-overlay'),
    t: document.querySelector('#ability-t .ability-cd-overlay'),
};

let audioStarted = false;
let isGunLoading = false;

// --- INITIALIZATION ---
function init() {
    // Generate starting HP between 70 and 90
    player.maxHp = Math.floor(Math.random() * (90 - 70 + 1)) + 70;
    player.hp = player.maxHp;
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

// --- INPUT HANDLING ---
function handleKeyDown(e) {
    // Start audio on first input
    if (!audioStarted) {
        const bgm = document.getElementById('bgm-player');
        if (bgm) {
            bgm.volume = 0.5;
            bgm.play().catch(err => console.log('BGM Autoplay prevented:', err));
        }
        audioStarted = true;
    }

    if (!player.alive) return;
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
    
    const now = performance.now();
    if (k === 'q' && canUseAbility('q', now)) useAbilityQ(now);
    if (k === 'e' && canUseAbility('e', now)) useAbilityE(now);
    if (k === 'r' && canUseAbility('r', now)) useAbilityR(now);
    if (k === 't' && canUseAbility('t', now)) useAbilityT(now);
}

function handleKeyUp(e) {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
}

function canUseAbility(id, now) {
    return (now - abilities[id].lastUsed) >= abilities[id].cd;
}

function highlightAbility(id) {
    const el = document.getElementById(`ability-${id}`);
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 150);
}

// Visual flash on player for successful action
function flashPlayerSuccess() {
    playerEl.classList.remove('flash-success');
    void playerEl.offsetWidth; // trigger reflow
    playerEl.classList.add('flash-success');
}

// Visual flash on player for failed action
function flashPlayerFail() {
    playerEl.classList.remove('flash-fail');
    void playerEl.offsetWidth; // trigger reflow
    playerEl.classList.add('flash-fail');
}

// --- ABILITIES LOGIC ---

// Q: Coin Flip (50/50 Charge or Weakness)
function useAbilityQ(now) {
    abilities.q.lastUsed = now;
    highlightAbility('q');
    
    const roll = Math.random();
    if (roll < 0.5) {
        // Success
        if (player.chargeStacks < player.maxCharge) {
            player.chargeStacks++;
        }
        spawnFeedback("GAIN CHARGE", "success");
        flashPlayerSuccess();
    } else {
        // Fail
        player.weaknessStacks++;
        spawnFeedback("WEAKNESS", "fail");
        flashPlayerFail();
    }
}

// E: One Shot
function useAbilityE(now) {
    if (player.chargeStacks === 0) {
        spawnFeedback("NO CHARGE", "warn");
        return; // Fails to cast, no cooldown
    }
    if (isGunLoading) return;

    abilities.e.lastUsed = now;
    highlightAbility('e');
    isGunLoading = true;
    
    // Play gun loading sound
    const sfxLoading = document.getElementById('sfx-gun-loading');
    if (sfxLoading) {
        sfxLoading.currentTime = 0;
        sfxLoading.play().catch(err => console.log(err));
    }
    
    const s = player.chargeStacks;
    player.chargeStacks = 0; // Consumes all charges at the start
    
    // Exact Math implementation
    let successChance = 0.50 + (s * 0.15);
    let failChance = 0.25 - (s * 0.075);
    let exploChance = 0.25 - (s * 0.075);
    
    const resolveShot = () => {
        isGunLoading = false;
        
        // Play shot sound
        const sfxShot = document.getElementById('sfx-gun-shot');
        if (sfxShot) {
            sfxShot.currentTime = 0;
            sfxShot.play().catch(err => console.log(err));
        }
        
        spawnFlyingGun();
        
        const roll = Math.random();
        if (roll < successChance) {
            spawnFeedback("SUCCESS!", "success");
            flashPlayerSuccess();
        } else if (roll < (successChance + failChance)) {
            spawnFeedback("FAIL", "fail");
            flashPlayerFail();
        } else {
            triggerExplosion();
        }
    };

    // Use onended, with an error fallback so game doesn't stall
    if (sfxLoading) {
        sfxLoading.onended = resolveShot;
        sfxLoading.onerror = resolveShot;
        
        // Safe fallback in case audio event doesn't fire nicely
        setTimeout(() => {
            if (isGunLoading) resolveShot();
        }, 2000); 
    } else {
        resolveShot(); // No audio tags found
    }
}

// R: Reroll HP
function useAbilityR(now) {
    if (player.chargeStacks === 0) {
        spawnFeedback("NO CHARGE", "warn");
        return; // Fails to cast, no cooldown
    }

    abilities.r.lastUsed = now;
    highlightAbility('r');
    
    const s = player.chargeStacks;
    const numRolls = s + 1; 
    let bestRoll = 0;
    
    // Higher stacks bias results upward by taking best of N rolls
    for (let i = 0; i < numRolls; i++) {
        const roll = Math.floor(Math.random() * (120 - 60 + 1)) + 60;
        if (roll > bestRoll) bestRoll = roll;
    }
    
    player.maxHp = bestRoll;
    player.hp = Math.min(player.hp, player.maxHp); // Clamp current HP to Max
    
    spawnFeedback("HP REROLLED", "success");
    flashPlayerSuccess();
    
    // Consumes all charges
    player.chargeStacks = 0; 
}

// T: Reset
function useAbilityT(now) {
    if (player.chargeStacks !== 3) {
        spawnFeedback("NO CHARGE", "warn");
        return; // Fails to cast, no cooldown
    }
    
    abilities.t.lastUsed = now;
    highlightAbility('t');
    
    player.weaknessStacks = 0;
    player.chargeStacks = 0; // Consumes all charges, resetting E ability state
    
    spawnFeedback("RESET", "success");
    flashPlayerSuccess();
}

function triggerExplosion() {
    spawnFeedback("BOOM!", "boom");
    shakeScreen();
    
    // 20 base damage + 20% per Weakness stack
    const damageMultiplier = 1 + (0.20 * player.weaknessStacks);
    const totalDamage = Math.round(20 * damageMultiplier);
    
    player.hp -= totalDamage;
    if (player.hp <= 0) {
        player.hp = 0;
        player.alive = false;
        spawnFeedback("WASTED", "boom");
        playerEl.style.opacity = 0.2;
    }
}

function spawnFeedback(text, type) {
    const el = document.createElement('div');
    el.className = `feedback-text feedback-${type}`;
    el.innerText = text;
    // Spawn just above the player
    el.style.left = `${player.x}px`;
    el.style.top = `${player.y - 40}px`;
    feedbackLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function spawnFlyingGun() {
    const gun = document.createElement('img');
    gun.src = 'image/gun.png';
    gun.className = 'flying-gun';
    gun.style.left = `${player.x}px`;
    gun.style.top = `${player.y}px`;
    // Add to feedback layer to keep z-index correct but within game
    feedbackLayer.appendChild(gun);
    setTimeout(() => gun.remove(), 600);
}

function shakeScreen() {
    gameContainer.classList.remove('shake-active');
    void gameContainer.offsetWidth; // trigger reflow
    gameContainer.classList.add('shake-active');
}

// --- MAIN LOOP ---
let lastTime = 0;
function gameLoop(now) {
    if (!lastTime) lastTime = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    
    // Input & Movement
    if (player.alive) {
        player.vx = 0;
        player.vy = 0;
        if (keys.w) player.vy = -1;
        if (keys.s) player.vy = 1;
        if (keys.a) player.vx = -1;
        if (keys.d) player.vx = 1;
        
        // Normalize diagonal movement
        if (player.vx !== 0 && player.vy !== 0) {
            const length = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
            player.vx /= length;
            player.vy /= length;
        }
        
        player.x += player.vx * player.speed * dt;
        player.y += player.vy * player.speed * dt;
        
        // Boundaries
        const halfSize = PLAYER_SIZE / 2;
        if (player.x < halfSize) player.x = halfSize;
        if (player.x > GAME_WIDTH - halfSize) player.x = GAME_WIDTH - halfSize;
        if (player.y < halfSize) player.y = halfSize;
        if (player.y > GAME_HEIGHT - halfSize) player.y = GAME_HEIGHT - halfSize;
    }

    updateRender(now);
    requestAnimationFrame(gameLoop);
}

function updateRender(now) {
    // Player position
    playerEl.style.transform = `translate(-50%, -50%) translate(${player.x - GAME_WIDTH/2}px, ${player.y - GAME_HEIGHT/2}px)`;
    
    // UI Updates
    healthText.innerText = `${Math.ceil(player.hp)}/${player.maxHp}`;
    const hpPercent = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
    healthFill.style.width = `${hpPercent}%`;
    
    // Color code health bar if low
    if (hpPercent < 30) {
        healthFill.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
    } else {
        healthFill.style.background = 'linear-gradient(90deg, #059669, #10b981)';
    }

    chargeCountEl.innerText = `${player.chargeStacks}/${player.maxCharge}`;
    weaknessCountEl.innerText = `${player.weaknessStacks}`;
    
    // Cooldown UI
    Object.keys(abilities).forEach(key => {
        const ab = abilities[key];
        const elapsed = now - ab.lastUsed;
        if (elapsed < ab.cd) {
            const percentRemaining = 100 - ((elapsed / ab.cd) * 100);
            cdOverlays[key].style.height = `${percentRemaining}%`;
        } else {
            cdOverlays[key].style.height = `0%`;
        }
    });
}

// Start Game
init();
