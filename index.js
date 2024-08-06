require('dotenv').config();
const express = require('express');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

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

const User = mongoose.model('User', userSchema);

// chat-schema
const chatSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const Chat = mongoose.model('Chat', chatSchema);

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
    res.redirect(`/success?username=${encodeURIComponent(username)}`);
  } catch (err) {
    res.status(400).send('User is not registered');
  }
});

// User-login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(400).send('Invalid username or password');
  }
});

app.get('/chat', async (req, res) => {
  const { sender, receiver } = req.query;
  if (!sender || !receiver) {
    res.status(400).json({ message: 'Sender and receiver are required' });
  }
  try {
    const senderUser = await User.findOne({ username: sender });
    const receiverUser = await User.findOne({ username: receiver });

    if (!senderUser || !receiverUser) {
      res.status(404).json({ message: 'Sender or receiver not found' });
    }
    const chats = await Chat.find({
      $or: [
        { sender: senderUser._id, receiver: receiverUser._id },
        { sender: receiverUser._id, receiver: senderUser._id },
      ],
    }).sort({ timestamp: 1 });
    res.json(chats);
  } catch (err) {
    console.error('Error retrieving chats:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});
app.get('/success', (req, res) => {
  const { username } = req.query;
  res.render('success', { username });
});
app.get('/login', (req, res) => {
  res.render('login');
});
app.get('/chat', (req, res) => {
  res.render('chat');
});

const users = {};
// handle socket-connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // Handle private message
  socket.on('private message', async ({ receiver, message, token }) => {
    try {
      const decoded = jwt.verify(token, process.env.SECRET_KEY);
      const senderUser = await User.findById(decoded.userId);
      if (!senderUser) {
        return socket.emit('error', 'Sender not found');
      }
      socket.username = senderUser.username;

      const receiverUser = await User.findOne({ username: receiver });
      if (!receiverUser) {
        return socket.emit('error', 'Receiver not found');
      }

      // save chat to db
      const chatMessage = new Chat({
        sender: senderUser._id,
        receiver: receiverUser._id,
        message,
      });
      await chatMessage.save();
      console.log(chatMessage);

      // send message
      const receiverSocketId = users[receiver];
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('private message', {
          sender: senderUser.username,
          message,
          timestamp: chatMessage.timestamp.toISOString(),
        });
      }
    } catch (err) {
      console.log('Error handling message:', err);
      socket.emit('error', 'Internal server error');
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    if (socket.username) {
      delete users[socket.username];
    }
  });
});

const port = 8000;

server.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
