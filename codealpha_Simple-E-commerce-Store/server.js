const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const db = new Database('database.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT);
  CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, description TEXT, image TEXT);
  CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_email TEXT, total REAL, items TEXT);
`);


const rowCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (rowCount.count === 0) {
  const insert = db.prepare('INSERT INTO products (name, price, description, image) VALUES (?, ?, ?, ?)');
  insert.run('Wireless Headphones', 99.99, 'High-quality sound with noise cancellation.', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300');
  insert.run('Minimalist Watch', 149.50, 'Elegant design with a premium leather strap.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300');
  insert.run('Mechanical Keyboard', 89.99, 'RGB backlit with tactile blue switches.', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300');
}




app.post('/api/register', (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    stmt.run(email, hashedPassword);
    res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Email already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && bcrypt.compareSync(password, user.password)) {
    res.json({ success: true, email: user.email });
  } else {
    res.status(400).json({ success: false, message: 'Invalid credentials' });
  }
});


app.get('/api/products', (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  product ? res.json(product) : res.status(404).json({ message: 'Not found' });
});


app.post('/api/orders', (req, res) => {
  const { user_email, total, items } = req.body;
  const stmt = db.prepare('INSERT INTO orders (user_email, total, items) VALUES (?, ?, ?)');
  stmt.run(user_email, total, JSON.stringify(items));
  res.json({ success: true, message: 'Order processed successfully' });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));