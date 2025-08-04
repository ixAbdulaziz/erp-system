// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Database pool
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'erp_system',
  port: process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10
});

async function initialize() {
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      is_pinned BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(50) PRIMARY KEY,
      invoice_number VARCHAR(255),
      supplier_id INT,
      type VARCHAR(100),
      category VARCHAR(100),
      date DATE,
      amount_before_tax DECIMAL(12,2),
      tax_amount DECIMAL(12,2),
      total_amount DECIMAL(12,2),
      notes TEXT,
      file_data LONGTEXT,
      file_type VARCHAR(100),
      file_name VARCHAR(255),
      file_size BIGINT,
      purchase_order_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(50) PRIMARY KEY,
      supplier_id INT NOT NULL,
      description TEXT NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      pdf_file_data LONGTEXT,
      pdf_file_name VARCHAR(255),
      pdf_file_size BIGINT,
      created_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(50) PRIMARY KEY,
      supplier_id INT NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `);
  // Create or replace view
  await pool.query(`
    CREATE OR REPLACE VIEW supplier_stats AS
    SELECT 
      s.id,
      s.name,
      s.is_pinned,
      COUNT(DISTINCT i.id) as invoice_count,
      COALESCE(SUM(i.total_amount), 0) as total_invoices,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.supplier_id = s.id), 0) as total_payments,
      COALESCE(SUM(i.total_amount), 0) - COALESCE((SELECT SUM(amount) FROM payments p WHERE p.supplier_id = s.id), 0) as outstanding_amount,
      MAX(i.date) as latest_invoice_date
    FROM suppliers s
    LEFT JOIN invoices i ON s.id = i.supplier_id
    GROUP BY s.id, s.name, s.is_pinned
  `);
}

// Helper to send error
function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

// ===== Suppliers =====
app.get('/api/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY is_pinned DESC, name ASC');
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const { name, is_pinned = false } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    const [result] = await pool.query(
      'INSERT INTO suppliers (name, is_pinned) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), is_pinned=VALUES(is_pinned)',
      [name.trim(), is_pinned]
    );
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE name = ?', [name.trim()]);
    res.json(rows[0]);
  } catch (e) {
    handleError(res, e);
  }
});

app.put('/api/suppliers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, is_pinned } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (is_pinned !== undefined) {
      updates.push('is_pinned = ?');
      params.push(is_pinned);
    }
    if (!updates.length) {
      return res.status(400).json({ error: 'لا يوجد بيانات للتحديث' });
    }
    params.push(id);
    await pool.query(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (e) {
    handleError(res, e);
  }
});

app.patch('/api/suppliers/:id/pin', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_pinned } = req.body;
    await pool.query('UPDATE suppliers SET is_pinned = ? WHERE id = ?', [is_pinned ? 1 : 0, id]);
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (e) {
    handleError(res, e);
  }
});

// ===== Invoices =====
app.get('/api/invoices', async (req, res) => {
  try {
    const supplierId = req.query.supplier_id;
    let sql = `
      SELECT i.*, s.name AS supplier_name
      FROM invoices i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
    `;
    const params = [];
    if (supplierId) {
      sql += ' WHERE i.supplier_id = ?';
      params.push(supplierId);
    }
    sql += ' ORDER BY i.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
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

    if (!supplier_name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    // ensure supplier exists
    const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [supplier_name.trim()]);
    let supplier_id;
    if (supRows.length) {
      supplier_id = supRows[0].id;
    } else {
      const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [supplier_name.trim()]);
      supplier_id = ins.insertId;
    }

    await pool.query(
      `INSERT INTO invoices 
        (id, invoice_number, supplier_id, type, category, date, amount_before_tax, tax_amount, total_amount, notes, file_data, file_type, file_name, file_size, purchase_order_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         invoice_number=VALUES(invoice_number),
         type=VALUES(type),
         category=VALUES(category),
         date=VALUES(date),
         amount_before_tax=VALUES(amount_before_tax),
         tax_amount=VALUES(tax_amount),
         total_amount=VALUES(total_amount),
         notes=VALUES(notes),
         file_data=VALUES(file_data),
         file_type=VALUES(file_type),
         file_name=VALUES(file_name),
         file_size=VALUES(file_size),
         purchase_order_id=VALUES(purchase_order_id)
      `,
      [
        id,
        invoice_number,
        supplier_id,
        type,
        category,
        date,
        amount_before_tax || 0,
        tax_amount || 0,
        total_amount || 0,
        notes,
        file_data,
        file_type,
        file_name,
        file_size,
        purchase_order_id || null
      ]
    );

    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.put('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['invoice_number', 'type', 'category', 'date', 'amount_before_tax', 'tax_amount', 'total_amount', 'notes', 'file_data', 'file_type', 'file_name', 'file_size', 'purchase_order_id', 'supplier_name'];
    const updates = [];
    const params = [];
    const body = req.body;
    let supplier_id = null;
    if (body.supplier_name) {
      const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [body.supplier_name.trim()]);
      if (supRows.length) {
        supplier_id = supRows[0].id;
      } else {
        const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [body.supplier_name.trim()]);
        supplier_id = ins.insertId;
      }
      updates.push('supplier_id = ?');
      params.push(supplier_id);
    }
    fields.forEach(field => {
      if (body[field] !== undefined && field !== 'supplier_name') {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'لا يوجد بيانات لتحديثها' });
    params.push(id);
    await pool.query(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM invoices WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

// ===== Purchase Orders =====
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      ORDER BY po.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/api/purchase-orders', async (req, res) => {
  try {
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

    if (!supplier_name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    // ensure supplier exists
    const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [supplier_name.trim()]);
    let supplier_id;
    if (supRows.length) {
      supplier_id = supRows[0].id;
    } else {
      const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [supplier_name.trim()]);
      supplier_id = ins.insertId;
    }

    await pool.query(
      `INSERT INTO purchase_orders 
        (id, supplier_id, description, price, pdf_file_data, pdf_file_name, pdf_file_size, created_date)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         description=VALUES(description),
         price=VALUES(price),
         pdf_file_data=VALUES(pdf_file_data),
         pdf_file_name=VALUES(pdf_file_name),
         pdf_file_size=VALUES(pdf_file_size),
         created_date=VALUES(created_date)
      `,
      [id, supplier_id, description, price || 0, pdf_file_data, pdf_file_name, pdf_file_size, created_date]
    );

    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.put('/api/purchase-orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['description', 'price', 'status', 'pdf_file_data', 'pdf_file_name', 'pdf_file_size', 'created_date', 'supplier_name'];
    const updates = [];
    const params = [];
    const body = req.body;
    let supplier_id = null;
    if (body.supplier_name) {
      const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [body.supplier_name.trim()]);
      if (supRows.length) {
        supplier_id = supRows[0].id;
      } else {
        const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [body.supplier_name.trim()]);
        supplier_id = ins.insertId;
      }
      updates.push('supplier_id = ?');
      params.push(supplier_id);
    }
    fields.forEach(field => {
      if (body[field] !== undefined && field !== 'supplier_name') {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'لا يوجد بيانات للتحديثها' });
    params.push(id);
    await pool.query(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.delete('/api/purchase-orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // unlink invoices
    await pool.query('UPDATE invoices SET purchase_order_id = NULL WHERE purchase_order_id = ?', [id]);
    await pool.query('DELETE FROM purchase_orders WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

// ===== Payments =====
app.get('/api/payments', async (req, res) => {
  try {
    const supplierId = req.query.supplier_id;
    let sql = `SELECT p.*, s.name AS supplier_name FROM payments p LEFT JOIN suppliers s ON s.id = p.supplier_id`;
    const params = [];
    if (supplierId) {
      sql += ' WHERE p.supplier_id = ?';
      params.push(supplierId);
    }
    sql += ' ORDER BY p.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const { id, supplier_name, amount, date, notes } = req.body;
    if (!supplier_name) return res.status(400).json({ error: 'اسم المورد مطلوب' });
    // ensure supplier
    const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [supplier_name.trim()]);
    let supplier_id;
    if (supRows.length) {
      supplier_id = supRows[0].id;
    } else {
      const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [supplier_name.trim()]);
      supplier_id = ins.insertId;
    }
    await pool.query(
      `INSERT INTO payments (id, supplier_id, amount, date, notes)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE amount=VALUES(amount), date=VALUES(date), notes=VALUES(notes)
      `,
      [id, supplier_id, amount || 0, date, notes]
    );
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.put('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['amount', 'date', 'notes', 'supplier_name'];
    const updates = [];
    const params = [];
    const body = req.body;
    let supplier_id = null;
    if (body.supplier_name) {
      const [supRows] = await pool.query('SELECT id FROM suppliers WHERE name = ?', [body.supplier_name.trim()]);
      if (supRows.length) {
        supplier_id = supRows[0].id;
      } else {
        const [ins] = await pool.query('INSERT INTO suppliers (name) VALUES (?)', [body.supplier_name.trim()]);
        supplier_id = ins.insertId;
      }
      updates.push('supplier_id = ?');
      params.push(supplier_id);
    }
    fields.forEach(field => {
      if (body[field] !== undefined && field !== 'supplier_name') {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    });
    if (!updates.length) return res.status(400).json({ error: 'لا يوجد بيانات لتحديثها' });
    params.push(id);
    await pool.query(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

app.delete('/api/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM payments WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
});

// ===== Statistics =====
app.get('/api/statistics', async (req, res) => {
  try {
    const [[suppliersCount]] = await pool.query('SELECT COUNT(*) as count FROM suppliers');
    const [[invoicesCount]] = await pool.query('SELECT COUNT(*) as count FROM invoices');
    const [[ordersCount]] = await pool.query('SELECT COUNT(*) as count FROM purchase_orders');

    const [invoiceTotals] = await pool.query(`
      SELECT supplier_id, SUM(total_amount) as total_invoices
      FROM invoices
      GROUP BY supplier_id
    `);
    const [paymentTotals] = await pool.query(`
      SELECT supplier_id, SUM(amount) as total_payments
      FROM payments
      GROUP BY supplier_id
    `);

    res.json({
      suppliers_count: suppliersCount.count,
      invoices_count: invoicesCount.count,
      orders_count: ordersCount.count,
      invoice_totals: invoiceTotals,
      payment_totals: paymentTotals
    });
  } catch (e) {
    handleError(res, e);
  }
});

// Start
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Handle unexpected
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
