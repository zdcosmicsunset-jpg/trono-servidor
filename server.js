const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector'); // LIBRERÍA DE TIKTOK

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
    maxHp: 2000, // Vida base para el directo
    currentHp: 2000
};

// --- AQUÍ OCURRE LA MAGIA DEL GANADOR ---
// Esta función recibe el nombre de la persona que dio el último golpe y lo vuelve Rey
function spawnNewKing(winnerName = null) {
    kingState = {
        // Si hay un ganador (winnerName), lo pone en pantalla. Si no, crea uno al azar.
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

    // Si este golpe acaba de matar al rey (HP llega a 0)
    if (kingState.currentHp === 0) {
        io.emit('kingDefeated');
        console.log(`¡${attackerName} ha matado al rey!`);
        
        // Revive en 4 segundos y le pasa el nombre del asesino para que sea el nuevo Rey
        setTimeout(() => spawnNewKing(attackerName), 4000); 
    }
}

// --- CONEXIÓN DE CLIENTES (APK) ---
io.on('connection', (socket) => {
    console.log('📱 App conectada:', socket.id);
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });

    // Si tocas la pantalla de tu celular manualmente, ahora tomará tu usuario
    // en lugar de decir "Dueño del Celular"
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
    console.info(`✅ Conectado exitosamente al Live de @${state.roomInfo.owner.display_id}`);
}).catch(err => {
    console.error('❌ Error al conectar con TikTok:', err.message);
});

// 1. Escuchar LIKES (Tapping en la pantalla)
tiktokLiveConnection.on('like', data => {
    let totalDamage = data.likeCount * 2; 
    // data.uniqueId es el @usuario de TikTok que dio el Like
    processDamage(totalDamage, false, data.uniqueId);
});

// 2. Escuchar REGALOS (Rosas, etc)
tiktokLiveConnection.on('gift', data => {
    if (data.giftType === 1 && !data.repeatEnd) {
        return; 
    }
    
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;

    // data.uniqueId es el @usuario de TikTok que envió el regalo
    processDamage(totalDamage, true, data.uniqueId); 
});

// Iniciar el servidor
spawnNewKing();
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});
