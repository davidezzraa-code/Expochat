const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Increase request size limit so users can transfer image text strings
const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Allows files up to 10MB
});

app.use(express.static(__dirname + '/public'));

let waitingQueue = [];
let activePairs = {}; 
let totalOnline = 0;

io.on('connection', (socket) => {
    totalOnline++;
    io.emit('update_online_count', totalOnline);

    socket.on('find_stranger', () => {
        disconnectFromPartner(socket);

        if (waitingQueue.length > 0) {
            let partnerSocketId = waitingQueue.shift();

            if (io.sockets.sockets.get(partnerSocketId)) {
                activePairs[socket.id] = partnerSocketId;
                activePairs[partnerSocketId] = socket.id;

                socket.emit('chat_start');
                io.to(partnerSocketId).emit('chat_start');
                return;
            }
        }

        waitingQueue.push(socket.id);
        socket.emit('waiting');
    });

    socket.on('typing_status', (isTyping) => {
        let partnerId = activePairs[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('stranger_typing', isTyping);
        }
    });

    socket.on('send_message', (messageText) => {
        let partnerId = activePairs[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('receive_message', messageText);
        }
    });

    // Handle incoming image data from a user and route it to their partner
    socket.on('send_image', (imageDataUrl) => {
        let partnerId = activePairs[socket.id];
        if (partnerId) {
            io.to(partnerId).emit('receive_image', imageDataUrl);
        }
    });

    socket.on('disconnect', () => {
        totalOnline--;
        io.emit('update_online_count', totalOnline);
        disconnectFromPartner(socket);
    });
});

function disconnectFromPartner(socket) {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    let partnerId = activePairs[socket.id];
    if (partnerId) {
        io.to(partnerId).emit('partner_disconnected');
        delete activePairs[partnerId];
        delete activePairs[socket.id];
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running`));
