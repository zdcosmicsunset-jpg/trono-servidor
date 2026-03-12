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

let kingState = {
    username: "Cargando...",
    title: "El Soberano",
    maxHp: 2000,
    currentHp: 2000
};

function spawnNewKing(winnerName = null) {
    kingState = {
        username: winnerName ? winnerName : "Héroe_" + Math.floor(Math.random() * 999),
        title: Math.random() > 0.5 ? "El Invicto" : "El Legendario",
        maxHp: 2000,
        currentHp: 2000
    };
    io.emit('newKing', kingState);
}

function processDamage(amount, isCritical, attackerName) {
    if (kingState.currentHp <= 0) return; 

    kingState.currentHp -= amount;
    if (kingState.currentHp < 0) kingState.currentHp = 0;

    io.emit('kingHit', { damage: amount, isCritical: isCritical });
    io.emit('updateHp', { current: kingState.currentHp });

    if (kingState.currentHp === 0) {
        io.emit('kingDefeated');
        console.log(`¡${attackerName} ha matado al rey!`);
        setTimeout(() => spawnNewKing(attackerName), 4000); 
    }
}

// --- CONEXIÓN A TIKTOK LIVE ---
let tiktokUsername = "marycorona847";
let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);
let isConnectedToTikTok = false; // Control para no conectar dos veces

function connectToTikTok() {
    if (isConnectedToTikTok) return; // Si ya está conectado, no hace nada

    console.log(`⏳ Intentando conectar al Live de @${tiktokUsername}...`);
    
    tiktokLiveConnection.connect().then(state => {
        isConnectedToTikTok = true;
        console.info(`✅ ¡CONECTADO! Escuchando el Live de @${tiktokUsername}`);
    }).catch(err => {
        console.error(`❌ El Live no ha empezado o hay error:`, err.message || err);
        // Si falla, esperamos 5 segundos y reintentamos, PERO solo porque 
        // sabemos que diste la orden manual de empezar.
        setTimeout(connectToTikTok, 5000); 
    });
}

tiktokLiveConnection.on('disconnected', () => {
    console.warn('⚠️ Se perdió la conexión con TikTok.');
    isConnectedToTikTok = false;
});

tiktokLiveConnection.on('like', data => {
    let totalDamage = data.likeCount * 2; 
    processDamage(totalDamage, false, data.uniqueId);
});

tiktokLiveConnection.on('gift', data => {
    if (data.giftType === 1 && !data.repeatEnd) return; 
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;
    processDamage(totalDamage, true, data.uniqueId); 
});

// --- CONEXIÓN DE CLIENTES (APK) ---
io.on('connection', (socket) => {
    console.log('📱 App conectada:', socket.id);
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });

    // --- NUEVO: RECIBE LA ORDEN DE ENCENDER TIKTOK ---
    socket.on('iniciarConexionTikTok', () => {
        console.log("📱 El celular dio la orden de conectar a TikTok!");
        connectToTikTok();
    });

    socket.on('testHit', (data) => {
        processDamage(data.dmg, data.crit, data.attacker || "@marycorona847");
    });
    socket.on('testSuperGift', (data) => {
        processDamage(500, true, data ? data.attacker : "@marycorona847");
    });
});

spawnNewKing();
server.listen(PORT, () => {
    console.log(`🚀 Servidor encendido y esperando la señal del celular...`);
});
