const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

// Estados globales
let kingState = { username: "Cargando...", title: "El Soberano", maxHp: 3000, currentHp: 3000 };
let currentMVP = { username: "Nadie", damage: 0 };
let damageTracker = {}; // Para guardar quién hace más daño

// Variables del Frenesí
let frenzyActive = false;
let frenzyMeter = 0;
const FRENZY_MAX = 500; // Likes necesarios para activar el modo locura

function spawnNewKing(winnerName = null) {
    kingState = {
        username: winnerName ? winnerName : "Héroe_" + Math.floor(Math.random() * 999),
        title: Math.random() > 0.5 ? "El Invicto" : "El Legendario",
        maxHp: 3000,
        currentHp: 3000
    };
    
    // Reiniciar MVP y Frenesí al cambiar de Rey
    damageTracker = {};
    currentMVP = { username: "Nadie", damage: 0 };
    frenzyMeter = 0;
    frenzyActive = false;

    io.emit('newKing', kingState);
    io.emit('updateMVP', currentMVP);
    io.emit('updateFrenzy', 0);
}

function processInteraction(amount, isCritical, attackerName) {
    if (kingState.currentHp <= 0) return;

    // MECÁNICA 1: DEFENSA DEL TRONO (Curación si es el Rey actual)
    if (attackerName === kingState.username) {
        let healAmount = amount; 
        kingState.currentHp = Math.min(kingState.maxHp, kingState.currentHp + healAmount);
        io.emit('kingHeal', { amount: healAmount });
        io.emit('updateHp', { current: kingState.currentHp });
        return; // Termina aquí para no hacer daño
    }

    // MECÁNICA 3: FRENESÍ (Daño x3 si está activo)
    let actualDamage = frenzyActive ? amount * 3 : amount;

    kingState.currentHp -= actualDamage;
    if (kingState.currentHp < 0) kingState.currentHp = 0;

    io.emit('kingHit', { damage: actualDamage, isCritical: isCritical });
    io.emit('updateHp', { current: kingState.currentHp });

    // MECÁNICA 2: MVP SYSTEM
    damageTracker[attackerName] = (damageTracker[attackerName] || 0) + actualDamage;
    if (damageTracker[attackerName] > currentMVP.damage) {
        currentMVP = { username: attackerName, damage: damageTracker[attackerName] };
        io.emit('updateMVP', currentMVP);
    }

    if (kingState.currentHp === 0) {
        io.emit('kingDefeated');
        console.log(`¡${attackerName} ha matado al rey!`);
        setTimeout(() => spawnNewKing(attackerName), 4000); 
    }
}

// Función para manejar la barra de Frenesí
function addFrenzy(likes) {
    if (frenzyActive || kingState.currentHp <= 0) return;
    
    frenzyMeter += likes;
    io.emit('updateFrenzy', Math.min(1, frenzyMeter / FRENZY_MAX));

    if (frenzyMeter >= FRENZY_MAX) {
        frenzyActive = true;
        io.emit('frenzyStart');
        console.log("🔥 ¡FRENESÍ ACTIVADO!");
        
        // Dura 10 segundos
        setTimeout(() => {
            frenzyActive = false;
            frenzyMeter = 0;
            io.emit('frenzyEnd');
            io.emit('updateFrenzy', 0);
        }, 10000);
    }
}

// --- CONEXIÓN DE CLIENTES ---
io.on('connection', (socket) => {
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });
    socket.emit('updateMVP', currentMVP);
    socket.emit('updateFrenzy', frenzyMeter / FRENZY_MAX);

    socket.on('iniciarConexionTikTok', () => { connectToTikTok(); });
    socket.on('testHit', (data) => { 
        processInteraction(data.dmg, data.crit, data.attacker || "@marycorona847");
        addFrenzy(5); // Simulamos likes al hacer click
    });
    socket.on('testSuperGift', (data) => { processInteraction(500, true, data ? data.attacker : "@marycorona847"); });
});

// --- TIKTOK LIVE ---
let tiktokUsername = "marycorona847";
let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);
let isConnectedToTikTok = false;

function connectToTikTok() {
    if (isConnectedToTikTok) return;
    tiktokLiveConnection.connect().then(state => {
        isConnectedToTikTok = true;
        console.info(`✅ ¡CONECTADO! Escuchando a @${tiktokUsername}`);
    }).catch(err => {
        setTimeout(connectToTikTok, 5000); 
    });
}

tiktokLiveConnection.on('disconnected', () => { isConnectedToTikTok = false; });

tiktokLiveConnection.on('like', data => {
    let totalDamage = data.likeCount * 2; 
    processInteraction(totalDamage, false, data.uniqueId);
    addFrenzy(data.likeCount); // Llena la barra de Frenesí
});

tiktokLiveConnection.on('gift', data => {
    if (data.giftType === 1 && !data.repeatEnd) return; 
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;
    processInteraction(totalDamage, true, data.uniqueId); 
});

spawnNewKing();
server.listen(PORT, () => { console.log(`🚀 Servidor encendido en puerto ${PORT}`); });
