const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد Multer لرفع الملفات
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع PDF أو صورة فقط.'));
    }
  }
});

// إعداد الوسطاء (Middleware)
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// خدمة الملفات الثابتة
app.use('/css', express.static('css'));
app.use('/js', express.static('js'));
app.use(express.static('public'));
app.use(express.static('.'));

// إعداد قاعدة البيانات
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'invoice_system',
  charset: 'utf8mb4'
});

// اختبار الاتصال بقاعدة البيانات
db.connect((err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err);
    return;
  }
  console.log('تم الاتصال بقاعدة البيانات بنجاح');
});

// =================== صفحات HTML ===================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, 'add.html'));
});

app.get('/view', (req, res) => {
  res.sendFile(path.join(__dirname, 'view.html'));
});

app.get('/purchase-orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'purchase-orders.html'));
});

// =================== APIs للفواتير ===================

// جلب جميع الفواتير
app.get('/api/invoices', (req, res) => {
  const query = `
    SELECT 
      id,
      supplier,
      type,
      category,
      invoiceNumber,
      date,
      amountBeforeTax,
      taxAmount,
      totalAmount,
      notes,
      fileName,
      fileType,
      fileSize,
      createdAt,
      updatedAt
    FROM invoices 
    ORDER BY createdAt DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('خطأ في جلب الفواتير:', err);
      res.status(500).json({ error: 'خطأ في جلب الفواتير' });
      return;
    }
    
    // تحويل البيانات للتوافق مع الواجهة الأمامية
    const formattedResults = results.map(invoice => ({
      ...invoice,
      // إضافة بيانات إضافية إذا لزم الأمر
      fileURL: invoice.fileName ? `/files/${invoice.id}` : null
    }));
    
    res.json(formattedResults);
  });
});

// جلب فاتورة واحدة مع الملف
app.get('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  
  const query = 'SELECT * FROM invoices WHERE id = ?';
  
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('خطأ في جلب الفاتورة:', err);
      res.status(500).json({ error: 'خطأ في جلب الفاتورة' });
      return;
    }
    
    if (results.length === 0) {
      res.status(404).json({ error: 'الفاتورة غير موجودة' });
      return;
    }
    
    res.json(results[0]);
  });
});

// إضافة فاتورة جديدة
app.post('/api/invoices', (req, res) => {
  const {
    supplier,
    type,
    category,
    invoiceNumber,
    date,
    amountBeforeTax,
    taxAmount,
    totalAmount,
    notes,
    fileData,
    fileType,
    fileName,
    fileSize
  } = req.body;
  
  const query = `
    INSERT INTO invoices (
      supplier, type, category, invoiceNumber, date,
      amountBeforeTax, taxAmount, totalAmount, notes,
      fileData, fileType, fileName, fileSize
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(query, [
    supplier, type, category, invoiceNumber, date,
    amountBeforeTax, taxAmount, totalAmount, notes,
    fileData, fileType, fileName, fileSize
  ], (err, result) => {
    if (err) {
      console.error('خطأ في إضافة الفاتورة:', err);
      res.status(500).json({ error: 'خطأ في إضافة الفاتورة' });
      return;
    }
    
    res.json({ 
      message: 'تم إضافة الفاتورة بنجاح', 
      invoiceId: result.insertId 
    });
  });
});

// تحديث فاتورة
app.put('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const {
    supplier,
    type,
    category,
    invoiceNumber,
    date,
    amountBeforeTax,
    taxAmount,
    totalAmount,
    notes
  } = req.body;
  
  const query = `
    UPDATE invoices 
    SET supplier = ?, type = ?, category = ?, invoiceNumber = ?, 
        date = ?, amountBeforeTax = ?, taxAmount = ?, totalAmount = ?, 
        notes = ?, updatedAt = NOW()
    WHERE id = ?
  `;
  
  db.query(query, [
    supplier, type, category, invoiceNumber, date,
    amountBeforeTax, taxAmount, totalAmount, notes, id
  ], (err, result) => {
    if (err) {
      console.error('خطأ في تحديث الفاتورة:', err);
      res.status(500).json({ error: 'خطأ في تحديث الفاتورة' });
      return;
    }
    
    res.json({ message: 'تم تحديث الفاتورة بنجاح' });
  });
});

// حذف فاتورة
app.delete('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  
  // حذف الفاتورة من أوامر الشراء أولاً
  const unlinkQuery = 'UPDATE purchase_orders SET linkedInvoices = JSON_REMOVE(linkedInvoices, JSON_UNQUOTE(JSON_SEARCH(linkedInvoices, "one", ?))) WHERE JSON_SEARCH(linkedInvoices, "one", ?) IS NOT NULL';
  
  db.query(unlinkQuery, [id, id], (err) => {
    if (err) {
      console.error('خطأ في إلغاء ربط الفاتورة:', err);
    }
    
    // حذف الفاتورة
    const deleteQuery = 'DELETE FROM invoices WHERE id = ?';
    
    db.query(deleteQuery, [id], (err, result) => {
      if (err) {
        console.error('خطأ في حذف الفاتورة:', err);
        res.status(500).json({ error: 'خطأ في حذف الفاتورة' });
        return;
      }
      
      res.json({ message: 'تم حذف الفاتورة بنجاح' });
    });
  });
});

// =================== APIs لأوامر الشراء ===================

// جلب جميع أوامر الشراء
app.get('/api/purchase-orders', (req, res) => {
  const query = `
    SELECT 
      po.*,
      (SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id', i.id,
          'invoiceNumber', i.invoiceNumber,
          'supplier', i.supplier,
          'date', i.date,
          'totalAmount', i.totalAmount
        )
      ) FROM invoices i WHERE i.purchaseOrderId = po.id) as linkedInvoices
    FROM purchase_orders po
    ORDER BY po.createdDate DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('خطأ في جلب أوامر الشراء:', err);
      res.status(500).json({ error: 'خطأ في جلب أوامر الشراء' });
      return;
    }
    
    // تحويل البيانات للتوافق مع الواجهة الأمامية
    const formattedResults = results.map(po => ({
      ...po,
      linkedInvoices: po.linkedInvoices || []
    }));
    
    res.json(formattedResults);
  });
});

// إضافة أمر شراء جديد
app.post('/api/purchase-orders', (req, res) => {
  const {
    supplier,
    description,
    price,
    pdfData,
    pdfName,
    pdfSize
  } = req.body;
  
  // إنشاء ID جديد
  const getLastIdQuery = 'SELECT id FROM purchase_orders ORDER BY id DESC LIMIT 1';
  
  db.query(getLastIdQuery, (err, results) => {
    if (err) {
      console.error('خطأ في جلب آخر ID:', err);
      res.status(500).json({ error: 'خطأ في إنشاء أمر الشراء' });
      return;
    }
    
    const lastNum = results.length > 0 ? parseInt(results[0].id.split('-')[1]) : 0;
    const newId = `PO-${String(lastNum + 1).padStart(3, '0')}`;
    
    const query = `
      INSERT INTO purchase_orders (
        id, supplier, description, price, 
        pdfData, pdfName, pdfSize, createdDate, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active')
    `;
    
    db.query(query, [
      newId, supplier, description, price,
      pdfData, pdfName, pdfSize
    ], (err, result) => {
      if (err) {
        console.error('خطأ في إضافة أمر الشراء:', err);
        res.status(500).json({ error: 'خطأ في إضافة أمر الشراء' });
        return;
      }
      
      res.json({ 
        message: 'تم إضافة أمر الشراء بنجاح', 
        orderId: newId 
      });
    });
  });
});

// تحديث أمر شراء
app.put('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  const { supplier, description, price } = req.body;
  
  const query = `
    UPDATE purchase_orders 
    SET supplier = ?, description = ?, price = ?
    WHERE id = ?
  `;
  
  db.query(query, [supplier, description, price, id], (err, result) => {
    if (err) {
      console.error('خطأ في تحديث أمر الشراء:', err);
      res.status(500).json({ error: 'خطأ في تحديث أمر الشراء' });
      return;
    }
    
    res.json({ message: 'تم تحديث أمر الشراء بنجاح' });
  });
});

// حذف أمر شراء
app.delete('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  
  // إلغاء ربط الفواتير أولاً
  const unlinkQuery = 'UPDATE invoices SET purchaseOrderId = NULL WHERE purchaseOrderId = ?';
  
  db.query(unlinkQuery, [id], (err) => {
    if (err) {
      console.error('خطأ في إلغاء ربط الفواتير:', err);
    }
    
    // حذف أمر الشراء
    const deleteQuery = 'DELETE FROM purchase_orders WHERE id = ?';
    
    db.query(deleteQuery, [id], (err, result) => {
      if (err) {
        console.error('خطأ في حذف أمر الشراء:', err);
        res.status(500).json({ error: 'خطأ في حذف أمر الشراء' });
        return;
      }
      
      res.json({ message: 'تم حذف أمر الشراء بنجاح' });
    });
  });
});

// ربط فاتورة بأمر شراء
app.post('/api/purchase-orders/:id/link-invoice', (req, res) => {
  const { id } = req.params;
  const { invoiceId } = req.body;
  
  const query = 'UPDATE invoices SET purchaseOrderId = ? WHERE id = ?';
  
  db.query(query, [id, invoiceId], (err, result) => {
    if (err) {
      console.error('خطأ في ربط الفاتورة:', err);
      res.status(500).json({ error: 'خطأ في ربط الفاتورة' });
      return;
    }
    
    res.json({ message: 'تم ربط الفاتورة بنجاح' });
  });
});

// إلغاء ربط فاتورة
app.post('/api/invoices/:id/unlink', (req, res) => {
  const { id } = req.params;
  
  const query = 'UPDATE invoices SET purchaseOrderId = NULL WHERE id = ?';
  
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('خطأ في إلغاء ربط الفاتورة:', err);
      res.status(500).json({ error: 'خطأ في إلغاء ربط الفاتورة' });
      return;
    }
    
    res.json({ message: 'تم إلغاء ربط الفاتورة بنجاح' });
  });
});

// =================== APIs للمدفوعات ===================

// جلب مدفوعات مورد
app.get('/api/payments', (req, res) => {
  const { supplier } = req.query;
  
  let query = 'SELECT * FROM payments';
  let params = [];
  
  if (supplier) {
    query += ' WHERE supplier = ?';
    params.push(supplier);
  }
  
  query += ' ORDER BY date DESC';
  
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('خطأ في جلب المدفوعات:', err);
      res.status(500).json({ error: 'خطأ في جلب المدفوعات' });
      return;
    }
    
    res.json(results);
  });
});

// إضافة مدفوعة جديدة
app.post('/api/payments', (req, res) => {
  const { supplier, amount, date, notes } = req.body;
  
  const query = `
    INSERT INTO payments (supplier, amount, date, notes) 
    VALUES (?, ?, ?, ?)
  `;
  
  db.query(query, [supplier, amount, date, notes], (err, result) => {
    if (err) {
      console.error('خطأ في إضافة المدفوعة:', err);
      res.status(500).json({ error: 'خطأ في إضافة المدفوعة' });
      return;
    }
    
    res.json({ 
      message: 'تم إضافة المدفوعة بنجاح', 
      paymentId: result.insertId 
    });
  });
});

// تحديث مدفوعة
app.put('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  const { amount, date, notes } = req.body;
  
  const query = `
    UPDATE payments 
    SET amount = ?, date = ?, notes = ?, updatedAt = NOW()
    WHERE id = ?
  `;
  
  db.query(query, [amount, date, notes, id], (err, result) => {
    if (err) {
      console.error('خطأ في تحديث المدفوعة:', err);
      res.status(500).json({ error: 'خطأ في تحديث المدفوعة' });
      return;
    }
    
    res.json({ message: 'تم تحديث المدفوعة بنجاح' });
  });
});

// حذف مدفوعة
app.delete('/api/payments/:id', (req, res) => {
  const { id } = req.params;
  
  const query = 'DELETE FROM payments WHERE id = ?';
  
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('خطأ في حذف المدفوعة:', err);
      res.status(500).json({ error: 'خطأ في حذف المدفوعة' });
      return;
    }
    
    res.json({ message: 'تم حذف المدفوعة بنجاح' });
  });
});

// =================== APIs للموردين ===================

// جلب قائمة الموردين للإكمال التلقائي
app.get('/api/suppliers', (req, res) => {
  const query = `
    SELECT DISTINCT supplier as name 
    FROM invoices 
    WHERE supplier IS NOT NULL AND supplier != ''
    UNION
    SELECT DISTINCT supplier as name 
    FROM purchase_orders 
    WHERE supplier IS NOT NULL AND supplier != ''
    ORDER BY name
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('خطأ في جلب الموردين:', err);
      res.status(500).json({ error: 'خطأ في جلب الموردين' });
      return;
    }
    
    const suppliers = results.map(row => row.name);
    res.json({ suppliers });
  });
});

// =================== APIs للإحصائيات ===================

// إحصائيات اللوحة الرئيسية
app.get('/api/dashboard/stats', (req, res) => {
  const queries = {
    supplierCount: `
      SELECT COUNT(DISTINCT supplier) as count 
      FROM invoices 
      WHERE supplier IS NOT NULL AND supplier != ''
    `,
    invoiceCount: 'SELECT COUNT(*) as count FROM invoices',
    orderCount: 'SELECT COUNT(*) as count FROM purchase_orders',
    totalAmount: 'SELECT SUM(totalAmount) as total FROM invoices'
  };
  
  const results = {};
  const queryKeys = Object.keys(queries);
  let completed = 0;
  
  queryKeys.forEach(key => {
    db.query(queries[key], (err, result) => {
      if (err) {
        console.error(`خطأ في استعلام ${key}:`, err);
        results[key] = 0;
      } else {
        results[key] = result[0].count || result[0].total || 0;
      }
      
      completed++;
      if (completed === queryKeys.length) {
        res.json(results);
      }
    });
  });
});

// =================== تحليل الفواتير بالذكاء الاصطناعي ===================

app.post('/api/analyze-invoice', upload.single('invoice'), (req, res) => {
  // محاكاة تحليل الذكاء الاصطناعي
  // في التطبيق الحقيقي، ستستخدم خدمة OCR مثل Google Vision API
  
  const mockAnalysis = {
    supplier: 'شركة تجريبية',
    invoiceNumber: 'INV-' + Math.floor(Math.random() * 10000),
    date: new Date().toISOString().split('T')[0],
    type: 'فاتورة شراء',
    amountBeforeTax: Math.floor(Math.random() * 10000),
    taxAmount: 0,
    totalAmount: 0
  };
  
  mockAnalysis.totalAmount = mockAnalysis.amountBeforeTax + mockAnalysis.taxAmount;
  
  res.json({
    success: true,
    data: mockAnalysis
  });
});

// =================== معالجة الأخطاء ===================

app.use((err, req, res, next) => {
  console.error('خطأ في الخادم:', err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// =================== بدء الخادم ===================

app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`📊 لوحة الإدارة: http://localhost:${PORT}`);
});
