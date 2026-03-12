const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

let kingState = { username: "Cargando...", title: "El Soberano", maxHp: 5000, currentHp: 5000, shield: 0, level: 1, survivalTime: 0, lastStandUsed: false };
let currentMVP = { username: "Nadie", damage: 0 };
let damageTracker = {}; 

let comboMultiplier = 1;
let comboHits = 0;
let comboTimer = null;

let frenzyActive = false;
let frenzyMeter = 0;
const FRENZY_MAX = 1000;

function spawnNewKing(winnerName = null) {
    kingState = {
        username: winnerName ? winnerName : "Héroe_" + Math.floor(Math.random() * 999),
        title: "El Soberano",
        maxHp: 5000, currentHp: 5000, shield: 0, level: 1, survivalTime: 0, lastStandUsed: false
    };
    damageTracker = {}; currentMVP = { username: "Nadie", damage: 0 };
    frenzyMeter = 0; frenzyActive = false;
    io.emit('newKing', kingState);
    io.emit('updateMVP', currentMVP);
    io.emit('updateFrenzy', 0);
}

// Reloj de evolución
setInterval(() => {
    if (kingState.currentHp > 0 && kingState.username !== "Cargando...") {
        kingState.survivalTime++;
        if (kingState.survivalTime === 60 && kingState.level === 1) {
            kingState.level = 2; kingState.title = "EL INMORTAL";
            kingState.maxHp = 15000; kingState.currentHp += 10000; 
            io.emit('kingEvolution', kingState);
            io.emit('updateHp', { current: kingState.currentHp });
        }
    }
}, 1000);

function resetCombo() {
    comboMultiplier = 1; comboHits = 0;
    io.emit('updateCombo', comboMultiplier);
}

function processInteraction(amount, isCritical, attackerName, giftCost = 0) {
    if (kingState.currentHp <= 0) return;

    // EL JUICIO FINAL (Regalos Gigantes +1000 monedas)
    if (giftCost >= 1000) {
        amount = kingState.maxHp * 0.8; 
        kingState.shield = 0; // El Nuke destruye el escudo inmediatamente
        io.emit('shieldBroken');
        io.emit('nukeStrike', { attacker: attackerName });
    }

    // DEFENSA: El Rey invoca un Escudo Divino
    if (attackerName === kingState.username && giftCost > 0) {
        kingState.shield += giftCost * 100; 
        io.emit('kingShieldUpdate', { shield: kingState.shield });
        return; 
    }

    // CURACIÓN: Si es el Rey y da Likes (Opcional, sanación mínima)
    if (attackerName === kingState.username && giftCost === 0) {
        let healAmount = amount; 
        kingState.currentHp = Math.min(kingState.maxHp, kingState.currentHp + healAmount);
        io.emit('kingHeal', { amount: healAmount });
        io.emit('updateHp', { current: kingState.currentHp });
        return;
    }

    // COMBO SYSTEM
    comboHits++;
    if (comboHits > 20) comboMultiplier = 2;
    if (comboHits > 50) comboMultiplier = 3;
    if (comboHits > 100) comboMultiplier = 5;
    
    clearTimeout(comboTimer);
    comboTimer = setTimeout(resetCombo, 3000); 
    io.emit('updateCombo', comboMultiplier);

    let actualDamage = amount * comboMultiplier * (frenzyActive ? 3 : 1);

    if (kingState.shield > 0) {
        if (actualDamage >= kingState.shield) {
            actualDamage -= kingState.shield;
            kingState.shield = 0;
            io.emit('shieldBroken');
        } else {
            kingState.shield -= actualDamage;
            io.emit('kingShieldUpdate', { shield: kingState.shield });
            io.emit('shieldHit');
            return; 
        }
    }

    kingState.currentHp -= actualDamage;

    // ÚLTIMA VOLUNTAD (LAST STAND)
    if (kingState.currentHp <= 0 && !kingState.lastStandUsed) {
        if (Math.random() < 0.20) { // 20% de probabilidad
            kingState.currentHp = 1;
            kingState.shield += 500; 
            kingState.lastStandUsed = true;
            io.emit('lastStand');
            io.emit('kingShieldUpdate', { shield: kingState.shield });
        }
    }

    if (kingState.currentHp < 0) kingState.currentHp = 0;

    io.emit('kingHit', { damage: actualDamage, isCritical: isCritical || giftCost >= 1000 });
    io.emit('updateHp', { current: kingState.currentHp });

    // MVP SYSTEM
    damageTracker[attackerName] = (damageTracker[attackerName] || 0) + actualDamage;
    if (damageTracker[attackerName] > currentMVP.damage) {
        currentMVP = { username: attackerName, damage: damageTracker[attackerName] };
        io.emit('updateMVP', currentMVP);
    }

    if (kingState.currentHp === 0) {
        io.emit('kingDefeated');
        setTimeout(() => spawnNewKing(attackerName), 4000); 
    }
}

function addFrenzy(likes) {
    if (frenzyActive || kingState.currentHp <= 0) return;
    frenzyMeter += likes;
    io.emit('updateFrenzy', Math.min(1, frenzyMeter / FRENZY_MAX));
    if (frenzyMeter >= FRENZY_MAX) {
        frenzyActive = true; io.emit('frenzyStart');
        setTimeout(() => { frenzyActive = false; frenzyMeter = 0; io.emit('frenzyEnd'); io.emit('updateFrenzy', 0); }, 10000);
    }
}

io.on('connection', (socket) => {
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });
    socket.emit('updateMVP', currentMVP);
    
    socket.on('iniciarConexionTikTok', () => { connectToTikTok(); });
    socket.on('testHit', (data) => { processInteraction(data.dmg, data.crit, data.attacker, 0); addFrenzy(5); });
    socket.on('testSuperGift', (data) => { processInteraction(500, true, data.attacker, 50); });
    socket.on('testNuke', (data) => { processInteraction(0, true, data.attacker, 1500); });
});

let tiktokUsername = "marycorona847"; // TU USUARIO
let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);
let isConnectedToTikTok = false;

function connectToTikTok() {
    if (isConnectedToTikTok) return;
    tiktokLiveConnection.connect().then(state => {
        isConnectedToTikTok = true; console.info(`✅ ¡CONECTADO a @${tiktokUsername}!`);
    }).catch(err => { setTimeout(connectToTikTok, 5000); });
}

tiktokLiveConnection.on('disconnected', () => { isConnectedToTikTok = false; });
tiktokLiveConnection.on('like', data => { processInteraction(data.likeCount * 2, false, data.uniqueId, 0); addFrenzy(data.likeCount); });
tiktokLiveConnection.on('gift', data => {
    if (data.giftType === 1 && !data.repeatEnd) return; 
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;
    processInteraction(totalDamage, true, data.uniqueId, data.diamondCount); 
});

spawnNewKing();
server.listen(PORT, () => { console.log(`🚀 Servidor en puerto ${PORT}`); });
