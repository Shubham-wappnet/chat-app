require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = createServer(app);
const io = new Server(server);

// database connection
mongoose
  .connect('mongodb://127.0.0.1:27017/chatdb')
  .then(() => console.log('connected with db'))
  .catch((err) => console.log(err));

// user-schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
});

// chat-schema
const chatSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
  }),
);

// User-register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUND));
  try {
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.status(201).send('User registered successfully');
  } catch (err) {
    res.status(400).send('User is not registered');
  }
});

// User-login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign({ username: user.username }, process.env.SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(400).send('Invalid username or password');
  }
});

// handle socket-connection
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined`);
  });
  socket.on('private message', async ({ sender, receiver, message }) => {
    if (!sender || !receiver || !message) {
      return socket.emit('error', 'Invalid message data');
    }

    const chatMessage = new Chat({ sender, receiver, message });
    await chatMessage.save();

    io.to(receiver).emit('private message', {
      sender,
      message,
      timestamp: chatMessage.timestamp.toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('A user is disconnected');
  });
  
});

const port = 8000;

server.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
