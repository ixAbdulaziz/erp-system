const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الوسطاء (Middleware)
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // مجلد للملفات الثابتة (HTML, CSS, JS)

// إعداد قاعدة البيانات
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'my_system'
});

// اختبار الاتصال بقاعدة البيانات
db.connect((err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err);
    return;
  }
  console.log('تم الاتصال بقاعدة البيانات بنجاح');
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoints

// جلب جميع البيانات
app.get('/api/data', (req, res) => {
  const query = 'SELECT * FROM users'; // غير اسم الجدول حسب نظامك
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('خطأ في جلب البيانات:', err);
      res.status(500).json({ error: 'خطأ في جلب البيانات' });
      return;
    }
    res.json(results);
  });
});

// إضافة بيانات جديدة
app.post('/api/data', (req, res) => {
  const { name, email } = req.body; // غير الحقول حسب نظامك
  const query = 'INSERT INTO users (name, email) VALUES (?, ?)';
  
  db.query(query, [name, email], (err, result) => {
    if (err) {
      console.error('خطأ في إضافة البيانات:', err);
      res.status(500).json({ error: 'خطأ في إضافة البيانات' });
      return;
    }
    res.json({ message: 'تم إضافة البيانات بنجاح', id: result.insertId });
  });
});

// تحديث البيانات
app.put('/api/data/:id', (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  const query = 'UPDATE users SET name = ?, email = ? WHERE id = ?';
  
  db.query(query, [name, email, id], (err, result) => {
    if (err) {
      console.error('خطأ في تحديث البيانات:', err);
      res.status(500).json({ error: 'خطأ في تحديث البيانات' });
      return;
    }
    res.json({ message: 'تم تحديث البيانات بنجاح' });
  });
});

// حذف البيانات
app.delete('/api/data/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM users WHERE id = ?';
  
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('خطأ في حذف البيانات:', err);
      res.status(500.json({ error: 'خطأ في حذف البيانات' });
      return;
    }
    res.json({ message: 'تم حذف البيانات بنجاح' });
  });
});

// بدء الخادم
app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
