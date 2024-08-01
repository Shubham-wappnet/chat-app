const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// handle socket-connection
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  // room-functionality
  // socket.on('join room', (room) => {
  //   socket.join(room);
  //   console.log(`User ${socket.id} joined room ${room}`);
  // });
  // socket.on('leave room', (room) => {
  //   socket.leave(room);
  //   console.log(`User ${socket.id} left room ${room}`);
  // });

  // socket.on('chat message', ({ room, msg }) => {
  //   console.log(`Message to room ${room}: ${msg}`);
  //   if (room) {
  //     io.to(room).emit('chat message', msg);
  //   } else {
  //     io.emit('chat message', msg);
  //   }
  // });

  socket.on('disconnect', () => {
    console.log('A user is disconnected');
  });
});
const port = 8000;

server.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
