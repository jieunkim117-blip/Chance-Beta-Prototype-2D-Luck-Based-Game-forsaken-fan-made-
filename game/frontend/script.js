let GAME_WIDTH = 1000;
let GAME_HEIGHT = 700;
const PLAYER_SIZE = 100;

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
let joystick = { active: false, x: 0, y: 0 };
let currentDir = 'front';

let enemies = [];
let bullets = [];
const ENEMY_SIZE = 45;

const bgmList = [
    "music/(Forsaken Ost) 공식 핵로드 LMS - 다이스 (128k).mp3",
    "music/A Sonnellino's Wrath (Chance vs. Mafioso LMS) - Forsaken UST - mistiiful (128k).mp3",
    "music/BURNOUT (DIVA 1X x GHOUL TWO TIME LMS) - FORSAKEN OST PIANO COVER - Zayalpe (128k).mp3",
    "music/DEBITO DI SONNO - Mafioso Chase Theme Forsaken OST - Key After Key (128k).mp3",
    "music/[PLEAD] C00lkidd vs 007n7 Forsaken Roblox Animated Music Video - Igor Animations (128k).mp3"
];

let currentBgmIndex = -1;

function updateGameSize() {
    GAME_WIDTH = gameContainer.clientWidth;
    GAME_HEIGHT = gameContainer.clientHeight;
}

// --- INITIALIZATION ---
function init() {
    // Generate starting HP between 70 and 90
    player.maxHp = Math.floor(Math.random() * (90 - 70 + 1)) + 70;
    player.hp = player.maxHp;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    setupJoystick();
    setupMobileSkills();

    window.addEventListener('resize', updateGameSize);
    updateGameSize(); // Map initial size

    // Spawn simple slow red box enemy

    createEnemy();


    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function createEnemy() {
    const el = document.createElement('div');
    el.className = 'enemy-entity';
    const enemiesLayer = document.getElementById('enemies-layer');
    if (!enemiesLayer) return;

    enemiesLayer.appendChild(el);

    // Spawn somewhat randomly, far from player
    let ex, ey;
    do {
        ex = Math.random() * GAME_WIDTH;
        ey = Math.random() * GAME_HEIGHT;
    } while (Math.sqrt(Math.pow(ex - player.x, 2) + Math.pow(ey - player.y, 2)) < 300);

    enemies.push({
        x: ex,
        y: ey,
        speed: 295, // Player speed is 350. This is slower.
        el: el,
        lastHit: 0,
        stunUntil: 0
    });
}

function playNextRandomBgm() {
    const bgm = document.getElementById('bgm-player');
    if (!bgm) return;

    bgm.loop = false; // Override HTML loop

    let nextIdx;
    do {
        nextIdx = Math.floor(Math.random() * bgmList.length);
    } while (nextIdx === currentBgmIndex && bgmList.length > 1);

    currentBgmIndex = nextIdx;
    bgm.src = bgmList[nextIdx];
    bgm.volume = 0.5;
    bgm.play().catch(err => console.log('BGM Autoplay prevented:', err));

    bgm.onended = () => {
        playNextRandomBgm();
    };
}

function startAudio() {
    if (!audioStarted) {
        audioStarted = true;
        playNextRandomBgm();
    }
}

function setupMobileSkills() {
    ['q', 'e', 'r', 't'].forEach(id => {
        const el = document.getElementById(`ability-${id}`);
        // pointerdown handles both mouse click and touch
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            startAudio();
            const now = performance.now();
            if (player.alive && canUseAbility(id, now)) {
                if (id === 'q') useAbilityQ(now);
                if (id === 'e') useAbilityE(now);
                if (id === 'r') useAbilityR(now);
                if (id === 't') useAbilityT(now);
            }
        });
    });
}

function setupJoystick() {
    const joystickArea = document.getElementById('joystick-area');
    const joystickKnob = document.getElementById('joystick-knob');
    const joystickContainer = document.getElementById('joystick-container');

    let joystickOrigin = { x: 0, y: 0 };
    const knobMaxDist = 40;

    joystickArea.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startAudio();
        joystick.active = true;
        const rect = joystickContainer.getBoundingClientRect();
        joystickOrigin.x = rect.left + rect.width / 2;
        joystickOrigin.y = rect.top + rect.height / 2;
        joystickKnob.style.background = 'rgba(255, 255, 255, 0.7)';
        updateJoystick(e);
    });

    window.addEventListener('pointermove', (e) => {
        if (!joystick.active) return;
        updateJoystick(e);
    });

    window.addEventListener('pointerup', (e) => {
        joystick.active = false;
        joystick.x = 0;
        joystick.y = 0;
        joystickKnob.style.transform = `translate(-50%, -50%)`;
        joystickKnob.style.background = 'rgba(255, 255, 255, 0.4)';
    });

    function updateJoystick(e) {
        let dx = e.clientX - joystickOrigin.x;
        let dy = e.clientY - joystickOrigin.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > knobMaxDist) {
            dx = (dx / distance) * knobMaxDist;
            dy = (dy / distance) * knobMaxDist;
        }

        joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        joystick.x = dx / knobMaxDist;
        joystick.y = dy / knobMaxDist;
    }
}

// --- INPUT HANDLING ---
function handleKeyDown(e) {
    // Start audio on first input
    startAudio();

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

    const sfxCoin = document.getElementById('sfx-coin-flip');
    if (sfxCoin) {
        sfxCoin.currentTime = 0;
        sfxCoin.volume = 1.0; // Max volume as requested!
        sfxCoin.play().catch(err => console.log(err));
    }

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
        sfxLoading.volume = 1.0; // Max volume as requested!
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
            sfxShot.volume = 1.0; // Max volume as requested!
            sfxShot.play().catch(err => console.log(err));
        }

        spawnFlyingBullet();

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
    createExplosionEffect();

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

function spawnFlyingBullet() {
    let vx = 0, vy = 0, rot = 0;
    if (currentDir === 'front') { vy = 1; rot = 90; } // Down
    else if (currentDir === 'back') { vy = -1; rot = -90; } // Up
    else if (currentDir === 'left') { vx = -1; rot = 180; } // Left
    else if (currentDir === 'right') { vx = 1; rot = 0; } // Right

    const bullet = document.createElement('img');
    bullet.src = 'image/bullet.png';
    bullet.style.position = 'absolute';
    bullet.style.width = '60px';
    bullet.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
    bullet.style.zIndex = '15';
    feedbackLayer.appendChild(bullet);

    bullets.push({
        x: player.x,
        y: player.y,
        vx: vx,
        vy: vy,
        el: bullet,
        speed: 800,
        life: 2000,
        spawnTime: performance.now()
    });
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

function createExplosionEffect() {
    const layer = document.getElementById('explosion-layer');
    if (!layer) return;
    const boom = document.createElement('div');
    boom.className = 'explosion-burst';
    boom.style.left = `${player.x}px`;
    boom.style.top = `${player.y}px`;
    layer.appendChild(boom);
    setTimeout(() => boom.remove(), 600);
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

        // Keyboard mapping
        if (keys.w) player.vy -= 1;
        if (keys.s) player.vy += 1;
        if (keys.a) player.vx -= 1;
        if (keys.d) player.vx += 1;

        // Joystick mapping overrides or adds to keyboard
        if (joystick.active) {
            player.vx = joystick.x;
            player.vy = joystick.y;
        }

        // Normalize diagonal movement for keyboard (joystick is already clamped to 1 magnitude max)
        if (!joystick.active && player.vx !== 0 && player.vy !== 0) {
            const length = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
            player.vx /= length;
            player.vy /= length;
        }

        player.x += player.vx * player.speed * dt;
        player.y += player.vy * player.speed * dt;

        // Update player image based on direction
        if (player.vx !== 0 || player.vy !== 0) {
            let newDir = currentDir;
            if (Math.abs(player.vx) > Math.abs(player.vy)) {
                newDir = player.vx > 0 ? 'right' : 'left';
            } else {
                newDir = player.vy > 0 ? 'front' : 'back';
            }
            if (newDir !== currentDir) {
                currentDir = newDir;
                const playerImg = document.getElementById('player-img');
                if (playerImg) {
                    if (newDir === 'right') playerImg.src = 'image/오른쪽.png';
                    if (newDir === 'left') playerImg.src = 'image/왼쪽.png';
                    if (newDir === 'front') playerImg.src = 'image/앞모습.png';
                    if (newDir === 'back') playerImg.src = 'image/뒷모습.png';
                }
            }
        }

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.x += b.vx * b.speed * dt;
            b.y += b.vy * b.speed * dt;
            b.el.style.left = `${b.x}px`;
            b.el.style.top = `${b.y}px`;

            if (now - b.spawnTime > b.life) {
                b.el.remove();
                bullets.splice(i, 1);
                continue;
            }

            // check collision with enemies
            let hit = false;
            for (let j = 0; j < enemies.length; j++) {
                let e = enemies[j];
                let dx = b.x - e.x;
                let dy = b.y - e.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < ENEMY_SIZE / 2 + 30) {
                    // Hit enemy! Stun for 3 seconds
                    e.stunUntil = now + 3000;
                    b.el.remove();
                    bullets.splice(i, 1);
                    hit = true;
                    // Visual feedback
                    const el = document.createElement('div');
                    el.className = 'feedback-text feedback-warn';
                    el.innerText = 'STUN!';
                    el.style.left = `${e.x}px`;
                    el.style.top = `${e.y - 30}px`;
                    feedbackLayer.appendChild(el);
                    setTimeout(() => el.remove(), 1200);
                    break;
                }
            }
            if (hit) continue;
        }

        // Update Enemies
        for (let i = 0; i < enemies.length; i++) {
            let e = enemies[i];

            // AI Logic: move towards player if not stunned
            let dx = player.x - e.x;
            let dy = player.y - e.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (!e.stunUntil || now >= e.stunUntil) {
                if (dist > 0) {
                    e.x += (dx / dist) * e.speed * dt;
                    e.y += (dy / dist) * e.speed * dt;
                }
                e.el.style.opacity = '1';
                e.el.style.filter = 'none';
            } else {
                // visual effect for stun
                e.el.style.opacity = '0.7';
                e.el.style.filter = 'grayscale(100%)';
            }

            // Collision with player
            let hitboxDist = dist - (PLAYER_SIZE / 2 + ENEMY_SIZE / 2);
            if (hitboxDist <= 0 && (!e.stunUntil || now >= e.stunUntil)) {
                // Collided
                if (now - e.lastHit > 1000) { // 1 sec cooldown
                    e.lastHit = now;
                    player.hp -= 1;
                    if (player.hp <= 0) {
                        player.hp = 0;
                        player.alive = false;
                        playerEl.style.opacity = 0.2;
                        spawnFeedback("WASTED", "boom");
                    }
                    spawnFeedback("-1 HP", "fail");
                    shakeScreen();
                }
            }

            // Render Enemy
            e.el.style.left = `${e.x}px`;
            e.el.style.top = `${e.y}px`;
        }

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
    playerEl.style.transform = `translate(-50%, -50%) translate(${player.x - GAME_WIDTH / 2}px, ${player.y - GAME_HEIGHT / 2}px)`;

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
