const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const db = new Database('database.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Schema Setup
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, bio TEXT DEFAULT 'Hello world!');
  CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, username TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS likes (post_id INTEGER, username TEXT, PRIMARY KEY (post_id, username));
  CREATE TABLE IF NOT EXISTS followers (follower TEXT, following TEXT, PRIMARY KEY (follower, following));
`);

// --- SEEDING 50 UNIQUE CHARACTER USERS & 150 POSTS ---
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  console.log('Seeding 50 distinct users and 150 posts...');
  const hashedDefaultPassword = bcrypt.hashSync('password123', 10);
  const insertUser = db.prepare('INSERT INTO users (username, password, bio) VALUES (?, ?, ?)');
  const insertPost = db.prepare('INSERT INTO posts (username, content) VALUES (?, ?)');

  // Array of 50 different character names across different letters of the alphabet
  const characterNames = [
    'Alex', 'Arthur', 'Arya', 'Asher', 'Batman', 'Bruce', 'Bella', 'Ben', 
    'Casper', 'Cinderella', 'Chris', 'David', 'Diana', 'Danny', 'Emma', 'Elsa', 
    'Ethan', 'Frodo', 'Flash', 'Goku', 'Gandalf', 'Harry', 'Hermione', 'Hulk', 
    'Ironman', 'Jack', 'JonSnow', 'Joker', 'Katniss', 'Kirby', 'Logan', 'Luffy', 
    'Mario', 'Mickey', 'Naruto', 'Neo', 'Oliver', 'PeterParker', 'Percy', 'Quinn', 
    'Robin', 'Ronaldo', 'Sonic', 'Spiderman', 'Tarzan', 'Thor', 'Vader', 'WalterWhite', 
    'Xavier', 'Yoda', 'Zelda'
  ];

  const niches = ['Photographer 📸', 'Gamer 🎮', 'Vlogger 🎥', 'Musician 🎵', 'Developer 💻', 'Athlete 🏃‍♂️'];
  const captions = [
    'Chasing dreams and making memories. ✨',
    'New setup layout complete! Rate it out of 10 🚀',
    'Just pushed a huge code update directly to production. 💻',
    'Beautiful day out here. Loving the weather! ☀️',
    'Late night gym sessions hit completely different. 💪',
    'Acoustic jam sessions in my living room. 🎵'
  ];

  // Seed users with the character names
  characterNames.forEach((name, index) => {
    const bio = `${niches[index % niches.length]} | Verified Character #${index + 1}`;
    insertUser.run(name, hashedDefaultPassword, bio);
  });

  // Distribute 150 posts evenly across these characters
  for (let p = 1; p <= 150; p++) {
    const randomAuthor = characterNames[Math.floor(Math.random() * characterNames.length)];
    const randomCaption = captions[p % captions.length];
    insertPost.run(randomAuthor, `${randomCaption} (Post #${p} by @${randomAuthor})`);
  }
  console.log('Database populated cleanly with character accounts!');
}

// --- AUTHENTICATION API ---
app.post('/api/register', (req, res) => {
  try {
    const { username, password } = req.body;
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Username already taken.' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && bcrypt.compareSync(password, user.password)) {
    res.json({ success: true, username: user.username });
  } else {
    res.status(400).json({ success: false, message: 'Invalid credentials.' });
  }
});

// --- NEW SEARCH & DYNAMIC SUGGESTION ENDPOINTS ---
app.get('/api/users/search', (req, res) => {
  const query = req.query.q || '';
  // Fetches up to 10 users matching the letter character entered
  const users = db.prepare('SELECT username, bio FROM users WHERE username LIKE ? LIMIT 10').all(`%${query}%`);
  res.json(users);
});

app.get('/api/users/click-suggestions', (req, res) => {
  // Returns exactly 10 initial user recommendations when search is clicked empty
  const users = db.prepare('SELECT username, bio FROM users ORDER BY RANDOM() LIMIT 10').all();
  res.json(users);
});

app.get('/api/users/sidebar', (req, res) => {
  const users = db.prepare('SELECT username, bio FROM users ORDER BY RANDOM() LIMIT 5').all();
  res.json(users);
});

app.get('/api/users/:username', (req, res) => {
  const user = db.prepare('SELECT username, bio FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ message: 'User not found' });
  
  const followersCount = db.prepare('SELECT COUNT(*) as count FROM followers WHERE following = ?').get(req.params.username).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM followers WHERE follower = ?').get(req.params.username).count;
  
  res.json({ ...user, followersCount, followingCount });
});

// --- TIMELINE FEED (FOLLOW SYSTEM FILTER) ---
app.get('/api/posts', (req, res) => {
  const viewer = req.query.user || '';
  let posts = [];

  if (viewer) {
    // CRITICAL: Shows posts ONLY from users you follow + your own posts!
    posts = db.prepare(`
      SELECT DISTINCT p.* FROM posts p
      LEFT JOIN followers f ON p.username = f.following
      WHERE f.follower = ? OR p.username = ?
      ORDER BY p.timestamp DESC
    `).all(viewer, viewer);
  }

  // Fallback if not logged in or not following anyone yet: show standard random starter posts
  if (posts.length === 0) {
    posts = db.prepare('SELECT * FROM posts ORDER BY timestamp DESC LIMIT 15').all();
  }
  
  const enhancedPosts = posts.map(post => {
    const likes = db.prepare('SELECT COUNT(*) as count FROM likes WHERE post_id = ?').get(post.id).count;
    const comments = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp ASC').all(post.id);
    const hasLiked = viewer ? db.prepare('SELECT 1 FROM likes WHERE post_id = ? AND username = ?').get(post.id, viewer) : null;

    return { ...post, likes, comments, userHasLiked: !!hasLiked };
  });
  
  res.json(enhancedPosts);
});

app.post('/api/posts', (req, res) => {
  const { username, content } = req.body;
  db.prepare('INSERT INTO posts (username, content) VALUES (?, ?)').run(username, content);
  res.json({ success: true });
});

// --- COMMENTS & LIKES ---
app.post('/api/comments', (req, res) => {
  const { post_id, username, content } = req.body;
  db.prepare('INSERT INTO comments (post_id, username, content) VALUES (?, ?, ?)').run(post_id, username, content);
  res.json({ success: true });
});

app.post('/api/posts/:id/like', (req, res) => {
  const { username } = req.body;
  const postId = req.params.id;
  try {
    db.prepare('INSERT INTO likes (post_id, username) VALUES (?, ?)').run(postId, username);
    res.json({ liked: true });
  } catch {
    db.prepare('DELETE FROM likes WHERE post_id = ? AND username = ?').run(postId, username);
    res.json({ liked: false });
  }
});

// --- FOLLOW HANDLING ENGINE ---
app.post('/api/follow', (req, res) => {
  const { follower, following } = req.body;
  if (follower === following) return res.status(400).json({ message: "Cannot follow yourself" });
  try {
    db.prepare('INSERT INTO followers (follower, following) VALUES (?, ?)').run(follower, following);
    res.json({ following: true });
  } catch {
    db.prepare('DELETE FROM followers WHERE follower = ? AND following = ?').run(follower, following);
    res.json({ following: false });
  }
});

app.get('/api/is-following', (req, res) => {
  const { follower, following } = req.query;
  const row = db.prepare('SELECT * FROM followers WHERE follower = ? AND following = ?').get(follower, following);
  res.json({ isFollowing: !!row });
});

app.listen(3000, () => console.log('Instagram System Online: http://localhost:3000'));