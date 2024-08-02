const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = createServer(app);
const io = new Server(server);

// database connection
mongoose
  .connect('mongodb://127.0.0.1:27017/chatdb')
  .then(() => console.log('connected with db'))
  .catch((err) => console.log(err));

// schema
const chatSchema = new mongoose.Schema({
  room: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});
const Chat = mongoose.model('Chat', chatSchema);

app.use(express.static('public'));

// handle socket-connection
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join room', async ({ room, lastMessage }) => {
    socket.join(room);
    console.log(`User joined room ${room}`);

    // send previous message in room 
    const query = lastMessage ? { room, timestamp: { $gt: new Date(lastMessage) } } : { room };
    const messages = await Chat.find(query).sort({ timestamp: 1 }).exec();
    messages.forEach((msg) => {
      socket.emit('chat message', { room: room, message: msg.message, timestamp: msg.timestamp.toISOString() });
    });
  });

  // message save in db
  socket.on('chat message', async (data) => {
    const { room, message } = data;
    if (!room) {
      return socket.emit('error', 'no room joined');
    }
    const chatMessage = new Chat({ room, message });
    await chatMessage.save();

    io.to(room).emit('chat message', { room, message, timestamp: chatMessage.timestamp.toISOString() });
  });

  socket.on('disconnect', () => {
    console.log('A user is disconnected');
  });
});

const port = 8000;

server.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
