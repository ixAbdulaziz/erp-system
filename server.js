// ---------------------------------------------------------------- //
// ------------------- إعدادات الخادم الأساسية ------------------- //
// ---------------------------------------------------------------- //

const express = require('express');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------- //
// ------------------- الاتصال بقاعدة البيانات ------------------- //
// ---------------------------------------------------------------- //

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ---------------------------------------------------------------- //
// ----------------- الإعدادات الوسيطة (Middleware) ----------------- //
// ---------------------------------------------------------------- //

app.use(cors()); // للسماح بالطلبات من أي مكان
app.use(express.json({ limit: '10mb' })); // للسماح بقراءة بيانات JSON القادمة من المتصفح، مع زيادة الحد الأقصى للملفات
app.use(express.static(path.join(__dirname, 'public'))); // هذا السطر مهم جدًا لعرض ملفات HTML

// ---------------------------------------------------------------- //
// ------------------ روابط الـ API (نقاط النهاية) ------------------ //
// ---------------------------------------------------------------- //

// --- واجهات برمجة تطبيقات الفواتير (Invoices API) ---

// جلب جميع الفواتير
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY invoice_date DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// إضافة فاتورة جديدة
app.post('/api/invoices', async (req, res) => {
  const { supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, file_data } = req.body;
  try {
    // معالجة البيانات الثنائية للملف إذا تم إرسالها كـ base64
    const fileDataBuffer = file_data ? Buffer.from(file_data.split(',')[1], 'base64') : null;

    const query = `
      INSERT INTO invoices (supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, file_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;
    const values = [supplier, type, category, invoice_number, invoice_date, amount_before_tax, tax_amount, total_amount, notes, file_name, fileDataBuffer];
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding invoice:', error);
    res.status(500).json({ error: 'Failed to add invoice' });
  }
});


// --- واجهات برمجة تطبيقات أوامر الشراء (Purchase Orders API) ---
// (سنضيف المزيد من الروابط هنا لاحقًا)


// ---------------------------------------------------------------- //
// ----------------------- تشغيل الخادم ----------------------- //
// ---------------------------------------------------------------- //

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
