const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configuración de CORS MUY IMPORTANTE
// Como tu APK (el celular) se conectará desde un origen diferente a Render,
// necesitas permitir que Socket.io acepte conexiones desde cualquier lugar (*).
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Estado global del juego en el servidor
let kingState = {
    username: "Cargando...",
    title: "El Soberano",
    maxHp: 1000,
    currentHp: 1000
};

function spawnNewKing() {
    kingState = {
        username: "Héroe_" + Math.floor(Math.random() * 9999),
        title: Math.random() > 0.5 ? "El Valiente" : "El Terror",
        maxHp: 1000,
        currentHp: 1000
    };
    io.emit('newKing', kingState);
}

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);
    
    // Al conectar un nuevo cliente (tu celular o la herramienta de TikTok), le enviamos el estado
    socket.emit('newKing', kingState);
    socket.emit('updateHp', { current: kingState.currentHp });

    // Evento: Golpe normal
    socket.on('testHit', (data) => {
        if (kingState.currentHp <= 0) return;

        kingState.currentHp -= data.dmg;
        if (kingState.currentHp < 0) kingState.currentHp = 0;

        io.emit('kingHit', { damage: data.dmg, isCritical: data.crit });
        io.emit('updateHp', { current: kingState.currentHp });

        if (kingState.currentHp === 0) {
            io.emit('kingDefeated');
            setTimeout(() => spawnNewKing(), 4000); // Revive tras 4 segundos
        }
    });

    // Evento: Ataque especial masivo
    socket.on('testSuperGift', () => {
        if (kingState.currentHp <= 0) return;
        
        const dmg = 500;
        kingState.currentHp -= dmg;
        if (kingState.currentHp < 0) kingState.currentHp = 0;

        io.emit('kingHit', { damage: dmg, isCritical: true });
        io.emit('updateHp', { current: kingState.currentHp });

        if (kingState.currentHp === 0) {
            io.emit('kingDefeated');
            setTimeout(() => spawnNewKing(), 4000);
        }
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// Inicializamos el primer rey al arrancar el servidor
spawnNewKing();

server.listen(PORT, () => {
    console.log(`Servidor de eventos escuchando en el puerto ${PORT}`);
});