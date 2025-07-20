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

// خدمة الملفات الثابتة
app.use('/css', express.static('css'));
app.use('/js', express.static('js'));
app.use(express.static('public'));

// إعداد قاعدة البيانات
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'purchase_system',
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

// الصفحات الأساسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add.html'));
});

app.get('/view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

app.get('/purchase-orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'purchase-orders.html'));
});

// ===== APIs لأوامر الشراء =====

// جلب جميع أوامر الشراء
app.get('/api/purchase-orders', (req, res) => {
  const query = `
    SELECT po.*, 
           COUNT(poi.id) as items_count,
           SUM(poi.quantity * poi.unit_price) as total_amount
    FROM purchase_orders po
    LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
    GROUP BY po.id
    ORDER BY po.created_at DESC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('خطأ في جلب أوامر الشراء:', err);
      res.status(500).json({ error: 'خطأ في جلب أوامر الشراء' });
      return;
    }
    res.json(results);
  });
});

// جلب أمر شراء واحد مع تفاصيله
app.get('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  
  const orderQuery = 'SELECT * FROM purchase_orders WHERE id = ?';
  const itemsQuery = 'SELECT * FROM purchase_order_items WHERE purchase_order_id = ?';
  
  db.query(orderQuery, [id], (err, orderResult) => {
    if (err) {
      console.error('خطأ في جلب أمر الشراء:', err);
      res.status(500).json({ error: 'خطأ في جلب أمر الشراء' });
      return;
    }
    
    if (orderResult.length === 0) {
      res.status(404).json({ error: 'أمر الشراء غير موجود' });
      return;
    }
    
    db.query(itemsQuery, [id], (err, itemsResult) => {
      if (err) {
        console.error('خطأ في جلب عناصر أمر الشراء:', err);
        res.status(500).json({ error: 'خطأ في جلب عناصر أمر الشراء' });
        return;
      }
      
      res.json({
        order: orderResult[0],
        items: itemsResult
      });
    });
  });
});

// إضافة أمر شراء جديد
app.post('/api/purchase-orders', (req, res) => {
  const { supplier_name, order_date, status, notes, items } = req.body;
  
  // إدراج أمر الشراء
  const orderQuery = `
    INSERT INTO purchase_orders (supplier_name, order_date, status, notes) 
    VALUES (?, ?, ?, ?)
  `;
  
  db.query(orderQuery, [supplier_name, order_date, status || 'pending', notes], (err, orderResult) => {
    if (err) {
      console.error('خطأ في إضافة أمر الشراء:', err);
      res.status(500).json({ error: 'خطأ في إضافة أمر الشراء' });
      return;
    }
    
    const orderId = orderResult.insertId;
    
    // إدراج عناصر أمر الشراء
    if (items && items.length > 0) {
      const itemsQuery = `
        INSERT INTO purchase_order_items (purchase_order_id, item_name, quantity, unit_price, description) 
        VALUES ?
      `;
      
      const itemsData = items.map(item => [
        orderId,
        item.item_name,
        item.quantity,
        item.unit_price,
        item.description || null
      ]);
      
      db.query(itemsQuery, [itemsData], (err, itemsResult) => {
        if (err) {
          console.error('خطأ في إضافة عناصر أمر الشراء:', err);
          res.status(500).json({ error: 'خطأ في إضافة عناصر أمر الشراء' });
          return;
        }
        
        res.json({ 
          message: 'تم إضافة أمر الشراء بنجاح', 
          orderId: orderId 
        });
      });
    } else {
      res.json({ 
        message: 'تم إضافة أمر الشراء بنجاح', 
        orderId: orderId 
      });
    }
  });
});

// تحديث أمر شراء
app.put('/api/purchase-orders/:id', (req, res) => {
  const { id } = req.params;
  const { supplier_name, order_date, status, notes } = req.body;
  
  const query = `
    UPDATE purchase_orders 
    SET supplier_name = ?, order_date = ?, status = ?, notes = ?, updated_at = NOW()
    WHERE id = ?
  `;
  
  db.query(query, [supplier_name, order_date, status, notes, id], (err, result) => {
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
  
  // حذف العناصر أولاً
  const deleteItemsQuery = 'DELETE FROM purchase_order_items WHERE purchase_order_id = ?';
  
  db.query(deleteItemsQuery, [id], (err, result) => {
    if (err) {
      console.error('خطأ في حذف عناصر أمر الشراء:', err);
      res.status(500).json({ error: 'خطأ في حذف أمر الشراء' });
      return;
    }
    
    // حذف أمر الشراء
    const deleteOrderQuery = 'DELETE FROM purchase_orders WHERE id = ?';
    
    db.query(deleteOrderQuery, [id], (err, result) => {
      if (err) {
        console.error('خطأ في حذف أمر الشراء:', err);
        res.status(500).json({ error: 'خطأ في حذف أمر الشراء' });
        return;
      }
      res.json({ message: 'تم حذف أمر الشراء بنجاح' });
    });
  });
});

// API للإحصائيات
app.get('/api/dashboard/stats', (req, res) => {
  const queries = {
    totalOrders: 'SELECT COUNT(*) as count FROM purchase_orders',
    pendingOrders: 'SELECT COUNT(*) as count FROM purchase_orders WHERE status = "pending"',
    completedOrders: 'SELECT COUNT(*) as count FROM purchase_orders WHERE status = "completed"',
    totalAmount: `
      SELECT SUM(poi.quantity * poi.unit_price) as total 
      FROM purchase_order_items poi 
      JOIN purchase_orders po ON poi.purchase_order_id = po.id
    `
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

// بدء الخادم
app.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
});
