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

// Modificamos la función para que el ganador se convierta en el nuevo rey
function spawnNewKing(winnerName = null) {
    kingState = {
        // Si hay un ganador, toma su nombre. Si no, genera uno genérico.
        username: winnerName ? winnerName : "Héroe_" + Math.floor(Math.random() * 999),
        title: Math.random() > 0.5 ? "El Invicto" : "El Legendario",
        maxHp: 2000,
        currentHp: 2000
    };
    io.emit('newKing', kingState);
}

// Función maestra para procesar cualquier tipo de daño (Likes, Regalos, etc)
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

    // Controles manuales por si tocas la pantalla del celular (Para pruebas)
    socket.on('testHit', (data) => processDamage(data.dmg, data.crit, "Dueño del Celular"));
    socket.on('testSuperGift', () => processDamage(500, true, "Dueño del Celular"));
});

// --- CONEXIÓN A TIKTOK LIVE ---
// Aquí pones tu usuario de TikTok.
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
    // Multiplicamos los likes por 2 de daño.
    let totalDamage = data.likeCount * 2; 
    processDamage(totalDamage, false, data.uniqueId);
});

// 2. Escuchar REGALOS (Rosas, etc)
tiktokLiveConnection.on('gift', data => {
    // Solo procesamos el regalo cuando la animación termine para no spamear la pantalla.
    if (data.giftType === 1 && !data.repeatEnd) {
        return; 
    }
    
    // El daño será 50 por cada "moneda" que cueste el regalo.
    let cost = data.diamondCount || 1;
    let totalDamage = cost * 50;

    processDamage(totalDamage, true, data.uniqueId); // true = golpe crítico visualmente
});

// Iniciar el servidor
spawnNewKing();
server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
});