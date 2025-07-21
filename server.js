const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// طباعة إعدادات قاعدة البيانات للتأكد
console.log('Database Configuration:', {
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  database: process.env.MYSQLDATABASE || 'railway',
  port: process.env.MYSQLPORT || 3306,
  hasPassword: !!process.env.MYSQLPASSWORD
});

// إعداد اتصال قاعدة البيانات - محدث للعمل مع Railway
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'railway', // تغيير من erp_system إلى railway
  port: process.env.MYSQLPORT || 3306,
  connectTimeout: 60000, // إضافة timeout أطول
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// الاتصال بقاعدة البيانات مع معالجة أفضل للأخطاء
db.connect((err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err);
    console.error('Error Code:', err.code);
    console.error('Error Number:', err.errno);
    console.error('SQL Message:', err.sqlMessage);
    console.error('SQL State:', err.sqlState);
    
    // محاولة إعادة الاتصال بعد 5 ثواني
    setTimeout(() => {
      console.log('محاولة إعادة الاتصال بقاعدة البيانات...');
      db.connect((retryErr) => {
        if (retryErr) {
          console.error('فشلت محاولة إعادة الاتصال:', retryErr);
        } else {
          console.log('تم إعادة الاتصال بقاعدة البيانات بنجاح');
          initializeDatabase();
        }
      });
    }, 5000);
    return;
  }
  console.log('تم الاتصال بقاعدة البيانات بنجاح');
  initializeDatabase();
});

// دالة لإنشاء الجداول إذا لم تكن موجودة
async function initializeDatabase() {
  try {
    // إنشاء الجداول إذا لم تكن موجودة
    const tables = [
      // جدول الموردين
      `CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
      
      // جدول الفواتير
      `CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(50) PRIMARY KEY,
        invoice_number VARCHAR(100) NOT NULL UNIQUE,
        supplier_id INT NOT NULL,
        type VARCHAR(100),
        category VARCHAR(100),
        date DATE NOT NULL,
        amount_before_tax DECIMAL(10, 2) DEFAULT 0,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) DEFAULT 0,
        notes TEXT,
        file_data LONGTEXT,
        file_type VARCHAR(50),
        file_name VARCHAR(255),
        file_size INT,
        purchase_order_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        INDEX idx_supplier (supplier_id),
        INDEX idx_date (date),
        INDEX idx_po (purchase_order_id)
      )`,
      
      // جدول المدفوعات
      `CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(50) PRIMARY KEY,
        supplier_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        INDEX idx_supplier (supplier_id),
        INDEX idx_date (date)
      )`,
      
      // جدول أوامر الشراء
      `CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(50) PRIMARY KEY,
        supplier_id INT NOT NULL,
        description TEXT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        pdf_file_data LONGTEXT,
        pdf_file_name VARCHAR(255),
        pdf_file_size INT,
        created_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        INDEX idx_supplier (supplier_id),
        INDEX idx_date (created_date)
      )`
    ];
    
    // إنشاء الجداول
    for (const tableSQL of tables) {
      await dbQuery(tableSQL);
    }
    
    console.log('تم التحقق من الجداول بنجاح');
    
    // إنشاء view للإحصائيات
    await dbQuery(`
      CREATE OR REPLACE VIEW supplier_stats AS
      SELECT 
        s.id,
        s.name,
        s.is_pinned,
        COUNT(DISTINCT i.id) as invoice_count,
        COALESCE(SUM(i.total_amount), 0) as total_invoices,
        COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id = s.id), 0) as total_payments,
        COALESCE(SUM(i.total_amount), 0) - COALESCE((SELECT SUM(amount) FROM payments WHERE supplier_id = s.id), 0) as outstanding_amount,
        MAX(i.date) as latest_invoice_date
      FROM suppliers s
      LEFT JOIN invoices i ON s.id = i.supplier_id
      GROUP BY s.id, s.name, s.is_pinned
    `);
    
    console.log('تم إنشاء العروض (Views) بنجاح');
    
  } catch (err) {
    console.error('خطأ في تهيئة قاعدة البيانات:', err);
  }
}

// Convert callbacks to promises
const dbQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// معالج أخطاء عام
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ===== SUPPLIERS ENDPOINTS =====

// الحصول على جميع الموردين
app.get('/api/suppliers', asyncHandler(async (req, res) => {
  const suppliers = await dbQuery('SELECT * FROM suppliers ORDER BY is_pinned DESC, name ASC');
  res.json(suppliers);
}));

// إضافة مورد جديد
app.post('/api/suppliers', asyncHandler(async (req, res) => {
  const { name, is_pinned = false } = req.body;
  const result = await dbQuery('INSERT INTO suppliers (name, is_pinned) VALUES (?, ?)', [name, is_pinned]);
  res.json({ id: result.insertId, name, is_pinned });
}));

// تحديث مورد
app.put('/api/suppliers/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, is_pinned } = req.body;
  await dbQuery('UPDATE suppliers SET name = ?, is_pinned = ? WHERE id = ?', [name, is_pinned, id]);
  res.json({ success: true });
}));

// تثبيت/إلغاء تثبيت مورد
app.patch('/api/suppliers/:id/pin', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_pinned } = req.body;
  await dbQuery('UPDATE suppliers SET is_pinned = ? WHERE id = ?', [is_pinned, id]);
  res.json({ success: true });
}));

// ===== INVOICES ENDPOINTS =====

// الحصول على جميع الفواتير
app.get('/api/invoices', asyncHandler(async (req, res) => {
  const { supplier_id } = req.query;
  let sql = `
    SELECT i.*, s.name as supplier_name 
    FROM invoices i 
    JOIN suppliers s ON i.supplier_id = s.id
  `;
  const params = [];
  
  if (supplier_id) {
    sql += ' WHERE i.supplier_id = ?';
    params.push(supplier_id);
  }
  
  sql += ' ORDER BY i.date DESC';
  
  const invoices = await dbQuery(sql, params);
  res.json(invoices);
}));

// إضافة فاتورة جديدة
app.post('/api/invoices', asyncHandler(async (req, res) => {
  const {
    id,
    invoice_number,
    supplier_name,
    type,
    category,
    date,
    amount_before_tax,
    tax_amount,
    total_amount,
    notes,
    file_data,
    file_type,
    file_name,
    file_size,
    purchase_order_id
  } = req.body;

  // البحث عن المورد أو إنشاؤه
  let [supplier] = await dbQuery('SELECT id FROM suppliers WHERE name = ?', [supplier_name]);
  if (!supplier) {
    const result = await dbQuery('INSERT INTO suppliers (name) VALUES (?)', [supplier_name]);
    supplier = { id: result.insertId };
  }

  // إدراج الفاتورة
  await dbQuery(
    `INSERT INTO invoices (
      id, invoice_number, supplier_id, type, category, date,
      amount_before_tax, tax_amount, total_amount, notes,
      file_data, file_type, file_name, file_size, purchase_order_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, invoice_number, supplier.id, type, category, date,
      amount_before_tax, tax_amount, total_amount, notes,
      file_data, file_type, file_name, file_size, purchase_order_id
    ]
  );

  res.json({ success: true, id });
}));

// تحديث فاتورة
app.put('/api/invoices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    invoice_number,
    supplier_name,
    type,
    category,
    date,
    amount_before_tax,
    tax_amount,
    total_amount,
    notes
  } = req.body;

  // البحث عن المورد أو إنشاؤه
  let [supplier] = await dbQuery('SELECT id FROM suppliers WHERE name = ?', [supplier_name]);
  if (!supplier) {
    const result = await dbQuery('INSERT INTO suppliers (name) VALUES (?)', [supplier_name]);
    supplier = { id: result.insertId };
  }

  await dbQuery(
    `UPDATE invoices SET 
      invoice_number = ?, supplier_id = ?, type = ?, category = ?,
      date = ?, amount_before_tax = ?, tax_amount = ?, total_amount = ?, notes = ?
    WHERE id = ?`,
    [
      invoice_number, supplier.id, type, category,
      date, amount_before_tax, tax_amount, total_amount, notes, id
    ]
  );

  res.json({ success: true });
}));

// حذف فاتورة
app.delete('/api/invoices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await dbQuery('DELETE FROM invoices WHERE id = ?', [id]);
  res.json({ success: true });
}));

// ===== PAYMENTS ENDPOINTS =====

// الحصول على مدفوعات مورد
app.get('/api/payments', asyncHandler(async (req, res) => {
  const { supplier_id } = req.query;
  let sql = 'SELECT * FROM payments';
  const params = [];
  
  if (supplier_id) {
    sql += ' WHERE supplier_id = ?';
    params.push(supplier_id);
  }
  
  sql += ' ORDER BY date DESC';
  
  const payments = await dbQuery(sql, params);
  res.json(payments);
}));

// إضافة دفعة جديدة
app.post('/api/payments', asyncHandler(async (req, res) => {
  const { id, supplier_id, amount, date, notes } = req.body;
  await dbQuery(
    'INSERT INTO payments (id, supplier_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
    [id, supplier_id, amount, date, notes]
  );
  res.json({ success: true, id });
}));

// تحديث دفعة
app.put('/api/payments/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, date, notes } = req.body;
  await dbQuery(
    'UPDATE payments SET amount = ?, date = ?, notes = ? WHERE id = ?',
    [amount, date, notes, id]
  );
  res.json({ success: true });
}));

// حذف دفعة
app.delete('/api/payments/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await dbQuery('DELETE FROM payments WHERE id = ?', [id]);
  res.json({ success: true });
}));

// ===== PURCHASE ORDERS ENDPOINTS =====

// الحصول على أوامر الشراء
app.get('/api/purchase-orders', asyncHandler(async (req, res) => {
  const orders = await dbQuery(`
    SELECT po.*, s.name as supplier_name 
    FROM purchase_orders po 
    JOIN suppliers s ON po.supplier_id = s.id 
    ORDER BY po.id DESC
  `);
  res.json(orders);
}));

// إضافة أمر شراء جديد
app.post('/api/purchase-orders', asyncHandler(async (req, res) => {
  const {
    id,
    supplier_name,
    description,
    price,
    pdf_file_data,
    pdf_file_name,
    pdf_file_size,
    created_date
  } = req.body;

  // البحث عن المورد أو إنشاؤه
  let [supplier] = await dbQuery('SELECT id FROM suppliers WHERE name = ?', [supplier_name]);
  if (!supplier) {
    const result = await dbQuery('INSERT INTO suppliers (name) VALUES (?)', [supplier_name]);
    supplier = { id: result.insertId };
  }

  await dbQuery(
    `INSERT INTO purchase_orders (
      id, supplier_id, description, price, pdf_file_data, 
      pdf_file_name, pdf_file_size, created_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, supplier.id, description, price, pdf_file_data,
      pdf_file_name, pdf_file_size, created_date
    ]
  );

  res.json({ success: true, id });
}));

// تحديث أمر شراء
app.put('/api/purchase-orders/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { supplier_name, description, price, pdf_file_data, pdf_file_name, pdf_file_size } = req.body;

  // البحث عن المورد أو إنشاؤه
  let [supplier] = await dbQuery('SELECT id FROM suppliers WHERE name = ?', [supplier_name]);
  if (!supplier) {
    const result = await dbQuery('INSERT INTO suppliers (name) VALUES (?)', [supplier_name]);
    supplier = { id: result.insertId };
  }

  const updateFields = ['supplier_id = ?', 'description = ?', 'price = ?'];
  const updateValues = [supplier.id, description, price];

  if (pdf_file_data) {
    updateFields.push('pdf_file_data = ?', 'pdf_file_name = ?', 'pdf_file_size = ?');
    updateValues.push(pdf_file_data, pdf_file_name, pdf_file_size);
  }

  updateValues.push(id);

  await dbQuery(
    `UPDATE purchase_orders SET ${updateFields.join(', ')} WHERE id = ?`,
    updateValues
  );

  res.json({ success: true });
}));

// حذف أمر شراء
app.delete('/api/purchase-orders/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  // إلغاء ربط الفواتير أولاً
  await dbQuery('UPDATE invoices SET purchase_order_id = NULL WHERE purchase_order_id = ?', [id]);
  // حذف أمر الشراء
  await dbQuery('DELETE FROM purchase_orders WHERE id = ?', [id]);
  res.json({ success: true });
}));

// ===== STATISTICS ENDPOINTS =====

// إحصائيات عامة
app.get('/api/statistics', asyncHandler(async (req, res) => {
  const [suppliers] = await dbQuery('SELECT COUNT(*) as count FROM suppliers');
  const [invoices] = await dbQuery('SELECT COUNT(*) as count FROM invoices');
  const [orders] = await dbQuery('SELECT COUNT(*) as count FROM purchase_orders');
  
  const invoiceTotals = await dbQuery(`
    SELECT 
      supplier_id,
      SUM(total_amount) as total_invoices
    FROM invoices
    GROUP BY supplier_id
  `);
  
  const paymentTotals = await dbQuery(`
    SELECT 
      supplier_id,
      SUM(amount) as total_payments
    FROM payments
    GROUP BY supplier_id
  `);

  res.json({
    suppliers_count: suppliers.count,
    invoices_count: invoices.count,
    orders_count: orders.count,
    invoice_totals: invoiceTotals || [],
    payment_totals: paymentTotals || []
  });
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: db.state === 'authenticated' ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// خدمة الملفات الثابتة
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// معالج الأخطاء العام
app.use((err, req, res, next) => {
  console.error('خطأ في التطبيق:', err);
  res.status(500).json({
    error: err.message || 'حدث خطأ في الخادم',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// معالج للطرق غير الموجودة
app.use((req, res) => {
  res.status(404).json({ error: 'الصفحة المطلوبة غير موجودة' });
});

// بدء الخادم
const server = app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// معالجة إيقاف الخادم بشكل نظيف
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.end(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.end(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
