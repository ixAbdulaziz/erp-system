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

// إعداد اتصال قاعدة البيانات
const db = mysql.createConnection({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'erp_system',
  port: process.env.MYSQLPORT || 3306
});

// الاتصال بقاعدة البيانات
db.connect((err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err);
    return;
  }
  console.log('تم الاتصال بقاعدة البيانات بنجاح');
});

// Convert callbacks to promises
const dbQuery = (sql, params) => {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
};

// ===== SUPPLIERS ENDPOINTS =====

// الحصول على جميع الموردين
app.get('/api/suppliers', async (req, res) => {
  try {
    const suppliers = await dbQuery('SELECT * FROM suppliers ORDER BY is_pinned DESC, name ASC');
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة مورد جديد
app.post('/api/suppliers', async (req, res) => {
  const { name, is_pinned = false } = req.body;
  try {
    const result = await dbQuery('INSERT INTO suppliers (name, is_pinned) VALUES (?, ?)', [name, is_pinned]);
    res.json({ id: result.insertId, name, is_pinned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث مورد
app.put('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_pinned } = req.body;
  try {
    await dbQuery('UPDATE suppliers SET name = ?, is_pinned = ? WHERE id = ?', [name, is_pinned, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تثبيت/إلغاء تثبيت مورد
app.patch('/api/suppliers/:id/pin', async (req, res) => {
  const { id } = req.params;
  const { is_pinned } = req.body;
  try {
    await dbQuery('UPDATE suppliers SET is_pinned = ? WHERE id = ?', [is_pinned, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== INVOICES ENDPOINTS =====

// الحصول على جميع الفواتير
app.get('/api/invoices', async (req, res) => {
  const { supplier_id } = req.query;
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة فاتورة جديدة
app.post('/api/invoices', async (req, res) => {
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

  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث فاتورة
app.put('/api/invoices/:id', async (req, res) => {
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

  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف فاتورة
app.delete('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery('DELETE FROM invoices WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PAYMENTS ENDPOINTS =====

// الحصول على مدفوعات مورد
app.get('/api/payments', async (req, res) => {
  const { supplier_id } = req.query;
  try {
    let sql = 'SELECT * FROM payments';
    const params = [];
    
    if (supplier_id) {
      sql += ' WHERE supplier_id = ?';
      params.push(supplier_id);
    }
    
    sql += ' ORDER BY date DESC';
    
    const payments = await dbQuery(sql, params);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة دفعة جديدة
app.post('/api/payments', async (req, res) => {
  const { id, supplier_id, amount, date, notes } = req.body;
  try {
    await dbQuery(
      'INSERT INTO payments (id, supplier_id, amount, date, notes) VALUES (?, ?, ?, ?, ?)',
      [id, supplier_id, amount, date, notes]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث دفعة
app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, date, notes } = req.body;
  try {
    await dbQuery(
      'UPDATE payments SET amount = ?, date = ?, notes = ? WHERE id = ?',
      [amount, date, notes, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف دفعة
app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await dbQuery('DELETE FROM payments WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== PURCHASE ORDERS ENDPOINTS =====

// الحصول على أوامر الشراء
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const orders = await dbQuery(`
      SELECT po.*, s.name as supplier_name 
      FROM purchase_orders po 
      JOIN suppliers s ON po.supplier_id = s.id 
      ORDER BY po.id DESC
    `);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة أمر شراء جديد
app.post('/api/purchase-orders', async (req, res) => {
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

  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث أمر شراء
app.put('/api/purchase-orders/:id', async (req, res) => {
  const { id } = req.params;
  const { supplier_name, description, price, pdf_file_data, pdf_file_name, pdf_file_size } = req.body;

  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف أمر شراء
app.delete('/api/purchase-orders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // إلغاء ربط الفواتير أولاً
    await dbQuery('UPDATE invoices SET purchase_order_id = NULL WHERE purchase_order_id = ?', [id]);
    // حذف أمر الشراء
    await dbQuery('DELETE FROM purchase_orders WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== STATISTICS ENDPOINTS =====

// إحصائيات عامة
app.get('/api/statistics', async (req, res) => {
  try {
    const [suppliers] = await dbQuery('SELECT COUNT(*) as count FROM suppliers');
    const [invoices] = await dbQuery('SELECT COUNT(*) as count FROM invoices');
    const [orders] = await dbQuery('SELECT COUNT(*) as count FROM purchase_orders');
    
    const [invoiceTotals] = await dbQuery(`
      SELECT 
        SUM(total_amount) as total_invoices,
        supplier_id
      FROM invoices
      GROUP BY supplier_id
    `);
    
    const [paymentTotals] = await dbQuery(`
      SELECT 
        SUM(amount) as total_payments,
        supplier_id
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// خدمة الملفات الثابتة
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// بدء الخادم
app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
