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

// Estado global del Rey
let kingState = {
    username: "Cargando...",
    title: "El Soberano",
    maxHp: 2000,
    currentHp: 2000
};

// Función para coronar al nuevo Rey
function spawnNewKing(winnerName = null) {
    kingState = {
        username: winnerName ? winnerName : "Héroe_" + Math.floor(Math.random() * 999),
        title: Math.random() > 0.5 ? "El Invicto" : "El Legendario",
        maxHp: 2000,
        currentHp: 2000
    };
    io.emit('newKing', kingState);
}

// Función maestra para procesar el daño
function processDamage(amount, isCritical, attackerName) {
    if (kingState.currentHp <= 0) return; // Si ya murió, ignorar

    kingState.currentHp -= amount;
    if (kingState.currentHp < 0) kingState.currentHp = 0;

    io.emit('kingHit', { damage: amount, isCritical: isCritical });
    io.emit('updateHp', { current: kingState.currentHp });

    // Si este golpe acaba de matar al rey
    if (kingState.currentHp === 0) {
        io.emit('kingDefeated');
        console.log(`¡${attackerName} ha matado al rey!`);
        
        // Revive en 4 segundos y corona al asesino
        setTimeout(() => spawnNewKing(attackerName), 4000); 
    }
}

// --- CONEXIÓN DE CLIENTES (APK) ---
io.on('connection', (socket) => {
    console.log('📱 App conectada:', socket.id);
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });

    // Controles manuales
    socket.on('testHit', (data) => {
        processDamage(data.dmg, data.crit, data.attacker || "@marycorona847");
    });
    socket.on('testSuperGift', (data) => {
        processDamage(500, true, data ? data.attacker : "@marycorona847");
    });
});

// --- CONEXIÓN A TIKTOK LIVE ---
let tiktokUsername = "marycorona847";
let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername);

// Conectar al Live
tiktokLiveConnection.connect().then(state => {
    // CORRECCIÓN: Ya no leemos 'state.roomInfo.owner.display_id' para evitar el error.
    // Usamos directamente tu usuario para el mensaje de éxito.
    console.info(`✅ Conectado exitosamente al Live de @${tiktokUsername}`);
}).catch(err => {
    console.error('❌ Error al conectar con TikTok:', err.message || err);
});

// 1. Escuchar LIKES (Tapping en la pantalla)
tiktokLiveConnection.on('like', data => {
    let totalDamage = data.likeCount * 2; 
    processDamage(totalDamage, false, data.uniqueId);
});

// 2. Escuchar REGALOS (Rosas, etc)
tiktokLiveConnection.on('gift', data => {
    if (data.giftType === 1 && !data.repeatEnd) {
        return; 
    }
    
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;
    processDamage(totalDamage, true, data.uniqueId); 
});

// Iniciar el servidor
spawnNewKing();
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
