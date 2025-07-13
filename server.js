// server.js - نظام ERP مع PostgreSQL الكامل
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// إعداد المجلدات
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// تحميل متغيرات البيئة
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// إعداد قاعدة البيانات
let pool;
let DATABASE_AVAILABLE = false;

async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️ DATABASE_URL غير متوفر، سيتم استخدام localStorage فقط');
      return false;
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    // اختبار الاتصال
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    // إنشاء الجداول إذا لم تكن موجودة
    await createTables();
    
    DATABASE_AVAILABLE = true;
    console.log('✅ اتصال PostgreSQL نجح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في اتصال PostgreSQL:', error.message);
    DATABASE_AVAILABLE = false;
    return false;
  }
}

async function createTables() {
  const client = await pool.connect();
  
  try {
    // جدول الموردين
    await client.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) UNIQUE NOT NULL,
        total_invoices INTEGER DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        total_payments DECIMAL(15,2) DEFAULT 0,
        outstanding_amount DECIMAL(15,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول الفواتير
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR(100) NOT NULL,
        supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
        supplier_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        type VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount_before_tax DECIMAL(15,2) NOT NULL,
        tax_amount DECIMAL(15,2) NOT NULL,
        total_amount DECIMAL(15,2) NOT NULL,
        notes TEXT,
        file_data TEXT,
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        file_size INTEGER,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(invoice_number, supplier_name)
      )
    `);

    // جدول المدفوعات
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
        supplier_name VARCHAR(255) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        date DATE NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول أوامر الشراء
    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id VARCHAR(20) PRIMARY KEY,
        supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
        supplier_name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        price DECIMAL(15,2) NOT NULL,
        created_date DATE DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'active',
        pdf_file TEXT,
        pdf_file_name VARCHAR(255),
        linked_invoice_id UUID REFERENCES invoices(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // فهارس للأداء
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_payments_supplier ON payments(supplier_name)');
    
    console.log('✅ تم إنشاء/تحديث جداول قاعدة البيانات');
  } finally {
    client.release();
  }
}

// تحديث إحصائيات المورد
async function updateSupplierStats(supplierName) {
  if (!DATABASE_AVAILABLE) return;
  
  const client = await pool.connect();
  try {
    // حساب الإحصائيات
    const invoicesResult = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM invoices 
      WHERE supplier_name = $1 AND status = 'active'
    `, [supplierName]);

    const paymentsResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments 
      WHERE supplier_name = $1
    `, [supplierName]);

    const totalInvoices = parseInt(invoicesResult.rows[0].count);
    const totalAmount = parseFloat(invoicesResult.rows[0].total);
    const totalPayments = parseFloat(paymentsResult.rows[0].total);
    const outstanding = Math.max(0, totalAmount - totalPayments);

    // تحديث أو إنشاء المورد
    await client.query(`
      INSERT INTO suppliers (name, total_invoices, total_amount, total_payments, outstanding_amount)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (name) 
      DO UPDATE SET 
        total_invoices = $2,
        total_amount = $3,
        total_payments = $4,
        outstanding_amount = $5,
        updated_at = CURRENT_TIMESTAMP
    `, [supplierName, totalInvoices, totalAmount, totalPayments, outstanding]);

  } finally {
    client.release();
  }
}

// ===================================================================
// إعداد التطبيق
// ===================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// إعداد multer لرفع الملفات
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'));
    }
  }
});

// ===================================================================
// APIs للموردين
// ===================================================================

// جلب جميع الموردين مع إحصائياتهم
app.get('/api/suppliers', async (req, res) => {
  try {
    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: {},
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          name,
          total_invoices,
          total_amount,
          total_payments,
          outstanding_amount,
          updated_at
        FROM suppliers 
        WHERE is_active = true
        ORDER BY total_amount DESC
      `);

      // تنظيم البيانات حسب المورد
      const supplierData = {};
      result.rows.forEach(supplier => {
        supplierData[supplier.name] = {
          totalInvoices: supplier.total_invoices,
          totalAmount: parseFloat(supplier.total_amount),
          totalPayments: parseFloat(supplier.total_payments),
          outstanding: parseFloat(supplier.outstanding_amount),
          lastUpdated: supplier.updated_at
        };
      });

      res.json({
        success: true,
        data: supplierData,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في جلب الموردين:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في جلب بيانات الموردين'
    });
  }
});

// ===================================================================
// APIs للفواتير
// ===================================================================

// جلب فواتير مورد معين
app.get('/api/invoices/:supplier', async (req, res) => {
  try {
    const { supplier } = req.params;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: [],
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          id,
          invoice_number,
          date,
          type,
          category,
          amount_before_tax,
          tax_amount,
          total_amount,
          notes,
          file_data,
          file_name,
          file_type,
          file_size,
          created_at
        FROM invoices 
        WHERE supplier_name = $1 AND status = 'active'
        ORDER BY date DESC
      `, [supplier]);

      const invoices = result.rows.map(row => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        supplier: supplier,
        date: row.date,
        type: row.type,
        category: row.category,
        amountBeforeTax: parseFloat(row.amount_before_tax),
        taxAmount: parseFloat(row.tax_amount),
        totalAmount: parseFloat(row.total_amount),
        notes: row.notes,
        fileData: row.file_data,
        fileName: row.file_name,
        fileType: row.file_type,
        fileSize: row.file_size,
        createdAt: row.created_at
      }));

      res.json({
        success: true,
        data: invoices,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في جلب الفواتير:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في جلب الفواتير'
    });
  }
});

// حفظ فاتورة جديدة
app.post('/api/invoice', upload.single('file'), async (req, res) => {
  try {
    let fileData = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    // معالجة الملف المرفوع
    if (req.file) {
      const fileBuffer = fs.readFileSync(req.file.path);
      fileData = `data:${req.file.mimetype};base64,${fileBuffer.toString('base64')}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
      fileSize = req.file.size;
      fs.unlinkSync(req.file.path); // حذف الملف المؤقت
    }

    const invoiceData = {
      invoiceNumber: req.body.invoiceNumber,
      supplier: req.body.supplier,
      date: req.body.date,
      type: req.body.type,
      category: req.body.category,
      amountBeforeTax: parseFloat(req.body.amountBeforeTax),
      taxAmount: parseFloat(req.body.taxAmount),
      totalAmount: parseFloat(req.body.amountBeforeTax) + parseFloat(req.body.taxAmount),
      notes: req.body.notes || '',
      fileData,
      fileName,
      fileType,
      fileSize
    };

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: invoiceData,
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      // إدراج الفاتورة
      const result = await client.query(`
        INSERT INTO invoices (
          invoice_number, supplier_name, date, type, category,
          amount_before_tax, tax_amount, total_amount, notes,
          file_data, file_name, file_type, file_size
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `, [
        invoiceData.invoiceNumber,
        invoiceData.supplier,
        invoiceData.date,
        invoiceData.type,
        invoiceData.category,
        invoiceData.amountBeforeTax,
        invoiceData.taxAmount,
        invoiceData.totalAmount,
        invoiceData.notes,
        fileData,
        fileName,
        fileType,
        fileSize
      ]);

      // تحديث إحصائيات المورد
      await updateSupplierStats(invoiceData.supplier);

      res.json({
        success: true,
        data: { ...invoiceData, id: result.rows[0].id },
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في حفظ الفاتورة:', error);
    
    // تنظيف الملف في حالة الخطأ
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: 'خطأ في حفظ الفاتورة'
    });
  }
});

// تحديث فاتورة
app.put('/api/invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const totalAmount = parseFloat(updates.amountBeforeTax) + parseFloat(updates.taxAmount);
      
      await client.query(`
        UPDATE invoices 
        SET 
          invoice_number = $1,
          supplier_name = $2,
          date = $3,
          type = $4,
          category = $5,
          amount_before_tax = $6,
          tax_amount = $7,
          total_amount = $8,
          notes = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
      `, [
        updates.invoiceNumber,
        updates.supplier,
        updates.date,
        updates.type,
        updates.category,
        updates.amountBeforeTax,
        updates.taxAmount,
        totalAmount,
        updates.notes,
        id
      ]);

      // تحديث إحصائيات المورد
      await updateSupplierStats(updates.supplier);

      res.json({
        success: true,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في تحديث الفاتورة:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في تحديث الفاتورة'
    });
  }
});

// حذف فاتورة
app.delete('/api/invoice/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      // جلب اسم المورد قبل الحذف
      const supplierResult = await client.query('SELECT supplier_name FROM invoices WHERE id = $1', [id]);
      const supplierName = supplierResult.rows[0]?.supplier_name;

      // حذف الفاتورة
      await client.query('UPDATE invoices SET status = $1 WHERE id = $2', ['deleted', id]);

      // تحديث إحصائيات المورد
      if (supplierName) {
        await updateSupplierStats(supplierName);
      }

      res.json({
        success: true,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في حذف الفاتورة:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في حذف الفاتورة'
    });
  }
});

// ===================================================================
// APIs للمدفوعات
// ===================================================================

// جلب مدفوعات مورد معين
app.get('/api/payments/:supplier', async (req, res) => {
  try {
    const { supplier } = req.params;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: [],
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT id, amount, date, notes, created_at
        FROM payments 
        WHERE supplier_name = $1
        ORDER BY date DESC
      `, [supplier]);

      const payments = result.rows.map(row => ({
        id: row.id,
        supplier: supplier,
        amount: parseFloat(row.amount),
        date: row.date,
        notes: row.notes,
        createdAt: row.created_at
      }));

      res.json({
        success: true,
        data: payments,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في جلب المدفوعات:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في جلب المدفوعات'
    });
  }
});

// حفظ دفعة جديدة
app.post('/api/payment', async (req, res) => {
  try {
    const { supplier, amount, date, notes } = req.body;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: { supplier, amount, date, notes },
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO payments (supplier_name, amount, date, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [supplier, amount, date, notes]);

      // تحديث إحصائيات المورد
      await updateSupplierStats(supplier);

      res.json({
        success: true,
        data: {
          id: result.rows[0].id,
          supplier,
          amount: parseFloat(amount),
          date,
          notes
        },
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في حفظ الدفعة:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في حفظ الدفعة'
    });
  }
});

// تحديث دفعة
app.put('/api/payment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, notes, supplier } = req.body;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      await client.query(`
        UPDATE payments 
        SET amount = $1, date = $2, notes = $3
        WHERE id = $4
      `, [amount, date, notes, id]);

      // تحديث إحصائيات المورد
      await updateSupplierStats(supplier);

      res.json({
        success: true,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في تحديث الدفعة:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في تحديث الدفعة'
    });
  }
});

// حذف دفعة
app.delete('/api/payment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplier } = req.query;

    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('DELETE FROM payments WHERE id = $1', [id]);

      // تحديث إحصائيات المورد
      if (supplier) {
        await updateSupplierStats(supplier);
      }

      res.json({
        success: true,
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في حذف الدفعة:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في حذف الدفعة'
    });
  }
});

// ===================================================================
// APIs للإحصائيات
// ===================================================================

// إحصائيات عامة
app.get('/api/dashboard', async (req, res) => {
  try {
    if (!DATABASE_AVAILABLE) {
      return res.json({
        success: true,
        data: {
          totalInvoices: 0,
          totalAmount: 0,
          totalSuppliers: 0,
          totalPayments: 0,
          outstandingAmount: 0
        },
        source: 'localStorage'
      });
    }

    const client = await pool.connect();
    try {
      const [invoicesResult, suppliersResult, paymentsResult] = await Promise.all([
        client.query('SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status = $1', ['active']),
        client.query('SELECT COUNT(*) as count FROM suppliers WHERE is_active = true'),
        client.query('SELECT COALESCE(SUM(amount), 0) as total FROM payments')
      ]);

      const totalInvoices = parseInt(invoicesResult.rows[0].count);
      const totalAmount = parseFloat(invoicesResult.rows[0].total);
      const totalSuppliers = parseInt(suppliersResult.rows[0].count);
      const totalPayments = parseFloat(paymentsResult.rows[0].total);
      const outstandingAmount = Math.max(0, totalAmount - totalPayments);

      res.json({
        success: true,
        data: {
          totalInvoices,
          totalAmount,
          totalSuppliers,
          totalPayments,
          outstandingAmount
        },
        source: 'PostgreSQL'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ خطأ في جلب الإحصائيات:', error);
    res.status(500).json({
      success: false,
      error: 'خطأ في جلب الإحصائيات'
    });
  }
});

// ===================================================================
// تشغيل الخادم
// ===================================================================

// إنشاء مجلد uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(port, '0.0.0.0', async () => {
  console.log(`\n🎉 ERP System with PostgreSQL started!`);
  console.log(`✅ Port: ${port}`);
  
  // تهيئة قاعدة البيانات
  const dbStatus = await initializeDatabase();
  
  if (dbStatus) {
    console.log(`🗄️ Database: PostgreSQL Connected`);
    console.log(`🔄 Tables: Created/Updated`);
  } else {
    console.log(`⚠️ Database: Using localStorage fallback`);
  }
  
  console.log(`\n🚀 System Features:`);
  console.log(`  • 📊 Supplier management with statistics`);
  console.log(`  • 🧾 Invoice management with file uploads`);
  console.log(`  • 💰 Payment tracking and outstanding calculations`);
  console.log(`  • 📈 Real-time dashboard statistics`);
  console.log(`  • 🔄 Automatic supplier stats updates`);
  console.log(`  • 💾 PostgreSQL with localStorage fallback`);
  
  console.log(`\n⚡ Ready to serve requests...\n`);
});
