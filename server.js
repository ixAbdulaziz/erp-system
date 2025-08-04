require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Setup DB pool, prefer full URL if provided
let pool;
if (process.env.MYSQL_URL) {
  pool = mysql.createPool(process.env.MYSQL_URL);
} else {
  pool = mysql.createPool({
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'erp_system',
    port: process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10
  });
}

// Initialize DB schema (migration)

async function initDb() {
  const conn = await pool.getConnection();
  try {
    // invoices table base definition (will not modify existing columns)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(50) PRIMARY KEY,
        invoice_number VARCHAR(100),
        supplier_name VARCHAR(255),
        type VARCHAR(100),
        category VARCHAR(100),
        date DATE,
        amount_before_tax DECIMAL(15,2),
        tax_amount DECIMAL(15,2),
        total_amount DECIMAL(15,2),
        notes TEXT,
        file_data LONGTEXT,
        file_type VARCHAR(100),
        file_name VARCHAR(255),
        file_size BIGINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);

    // ensure critical columns exist (for older existing table missing some)
    const expectedInvoiceCols = {
      invoice_number: 'VARCHAR(100)',
      supplier_name: 'VARCHAR(255)',
      type: 'VARCHAR(100)',
      category: 'VARCHAR(100)',
      date: 'DATE',
      amount_before_tax: 'DECIMAL(15,2)',
      tax_amount: 'DECIMAL(15,2)',
      total_amount: 'DECIMAL(15,2)',
      notes: 'TEXT',
      file_data: 'LONGTEXT',
      file_type: 'VARCHAR(100)',
      file_name: 'VARCHAR(255)',
      file_size: 'BIGINT',
      created_at: 'DATETIME DEFAULT CURRENT_TIMESTAMP'
    };
    // fetch existing columns for invoices
    const [colsRows] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'invoices'`
    );
    const existingCols = new Set(colsRows.map(r => r.COLUMN_NAME));
    for (const [col, definition] of Object.entries(expectedInvoiceCols)) {
      if (!existingCols.has(col)) {
        await conn.query(`ALTER TABLE invoices ADD COLUMN ${col} ${definition}`);
      }
    }

    // suppliers table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
    // purchase_orders table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(50) PRIMARY KEY,
        order_number VARCHAR(100),
        supplier_name VARCHAR(255),
        status VARCHAR(50),
        total_amount DECIMAL(15,2),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
    // payments table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(50) PRIMARY KEY,
        invoice_id VARCHAR(50),
        amount DECIMAL(15,2),
        method VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      ) ENGINE=INNODB;
    `);

    // create or replace view supplier_stats
    try {
      await conn.query(`
        CREATE OR REPLACE VIEW supplier_stats AS
        SELECT 
          supplier_name,
          COUNT(*) AS invoices_count,
          SUM(total_amount) AS total_spent
        FROM invoices
        GROUP BY supplier_name;
      `);
    } catch (err) {
      console.warn('Warning: could not create view supplier_stats:', err.message);
    }
  } finally {
    conn.release();
  }
}


initDb().catch(err => {
  console.error('Failed initializing database:', err);
  process.exit(1);
});

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Stats
app.get('/api/statistics', async (req, res) => {
  try {
    const [[suppliersCount]] = await pool.query('SELECT COUNT(DISTINCT supplier_name) AS suppliers_count FROM invoices');
    const [[invoicesCount]] = await pool.query('SELECT COUNT(*) AS invoices_count FROM invoices');
    const [[ordersCount]] = await pool.query('SELECT COUNT(*) AS orders_count FROM purchase_orders');
    const [[paymentsCount]] = await pool.query('SELECT COUNT(*) AS payments_count FROM payments');

    res.json({
      suppliers_count: suppliersCount.suppliers_count || 0,
      invoices_count: invoicesCount.invoices_count || 0,
      orders_count: ordersCount.orders_count || 0,
      payments_count: paymentsCount.payments_count || 0
    });
  } catch (err) {
    console.error('Statistics error:', err);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Suppliers endpoints
app.get('/api/suppliers', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Get suppliers error:', err);
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
});

app.post('/api/suppliers', async (req, res) => {
  try {
    const { name, id } = req.body;
    const supplierId = id || genId();
    await pool.query(
      'INSERT INTO suppliers (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)',
      [supplierId, name]
    );
    res.json({ id: supplierId, name });
  } catch (err) {
    console.error('Create supplier error:', err);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// Invoices endpoints
app.get('/api/invoices', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const invoice = req.body;
    if (!invoice.id) invoice.id = genId();
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
      file_size
    } = invoice;

    await pool.query(
      `INSERT INTO invoices 
       (id, invoice_number, supplier_name, type, category, date, amount_before_tax, tax_amount, total_amount, notes, file_data, file_type, file_name, file_size)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE 
         invoice_number=VALUES(invoice_number),
         supplier_name=VALUES(supplier_name),
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
         file_size=VALUES(file_size)
      `,
      [id, invoice_number, supplier_name, type, category, date, amount_before_tax, tax_amount, total_amount, notes, file_data, file_type, file_name, file_size]
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Save invoice error:', err);
    res.status(500).json({ error: 'Failed to save invoice' });
  }
});

// Purchase orders
app.get('/api/purchase-orders', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM purchase_orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Get purchase orders error:', err);
    res.status(500).json({ error: 'Failed to get purchase orders' });
  }
});

app.post('/api/purchase-orders', async (req, res) => {
  try {
    const order = req.body;
    if (!order.id) order.id = genId();
    const { id, order_number, supplier_name, status, total_amount } = order;
    await pool.query(
      `INSERT INTO purchase_orders (id, order_number, supplier_name, status, total_amount)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         order_number=VALUES(order_number),
         supplier_name=VALUES(supplier_name),
         status=VALUES(status),
         total_amount=VALUES(total_amount)
      `,
      [id, order_number, supplier_name, status, total_amount]
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Save purchase order error:', err);
    res.status(500).json({ error: 'Failed to save purchase order' });
  }
});

// Payments
app.get('/api/payments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payments ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Get payments error:', err);
    res.status(500).json({ error: 'Failed to get payments' });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = req.body;
    if (!payment.id) payment.id = genId();
    const { id, invoice_id, amount, method } = payment;
    await pool.query(
      `INSERT INTO payments (id, invoice_id, amount, method)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE
         invoice_id=VALUES(invoice_id),
         amount=VALUES(amount),
         method=VALUES(method)
      `,
      [id, invoice_id, amount, method]
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Save payment error:', err);
    res.status(500).json({ error: 'Failed to save payment' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
