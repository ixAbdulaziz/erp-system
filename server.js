import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';
import cors from 'cors';

// استيراد قاعدة البيانات
import { 
  createTables, 
  query, 
  productQueries, 
  orderQueries, 
  statsQueries 
} from './db.js';

// إنشاء __dirname للـ ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// إعدادات الجلسة
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // ساعتين
const activeSessions = new Map(); // {sessionId: {username, role, lastActivity, loginTime}}

// تحميل المستخدمين من متغيرات البيئة
const loadUsers = () => {
  const users = new Map();
  
  console.log('📋 Loading users from environment variables...');
  
  // البحث عن جميع متغيرات USER_*
  for (let i = 1; i <= 20; i++) {
    const userVar = process.env[`USER_${i}`];
    if (userVar) {
      try {
        const [username, password, role = 'user'] = userVar.split(':');
        if (username && password) {
          users.set(username.trim().toLowerCase(), {
            username: username.trim(),
            password: password.trim(),
            role: role.trim(),
            id: i
          });
          console.log(`✅ User ${i}: ${username.trim()} (${role.trim()})`);
        }
      } catch (error) {
        console.log(`❌ Error parsing USER_${i}: ${userVar}`);
      }
    }
  }
  
  // إضافة المستخدمين الافتراضيين إذا لم يوجد أي مستخدم
  if (users.size === 0) {
    console.log('⚠️ No users found in environment, adding defaults...');
    users.set('admin', {
      username: 'admin',
      password: 'password123',
      role: 'admin',
      id: 0
    });
    users.set('abdulaziz', {
      username: 'Abdulaziz',
      password: 'Aa@210658',
      role: 'admin',
      id: 0
    });
  }
  
  console.log(`🔐 Total users loaded: ${users.size}`);
  return users;
};

const USERS = loadUsers();

// إنشاء قاعدة البيانات عند بدء الخادم
const initializeDatabase = async () => {
  try {
    await createTables();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
  }
};

// تنظيف الجلسات المنتهية الصلاحية
const cleanupExpiredSessions = () => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, sessionData] of activeSessions.entries()) {
    if (now - sessionData.lastActivity > SESSION_TIMEOUT) {
      activeSessions.delete(sessionId);
      cleaned++;
      console.log(`🧹 Expired session for user: ${sessionData.username}`);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired sessions. Active: ${activeSessions.size}`);
  }
};

// تشغيل تنظيف الجلسات كل 10 دقائق
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

// إنشاء session ID فريد
const createSessionId = (username) => {
  return `${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// التحقق من صحة المستخدم
const validateUser = (username, password) => {
  const userKey = username?.trim().toLowerCase();
  const user = USERS.get(userKey);
  
  if (user && user.password === password?.trim()) {
    return user;
  }
  return null;
};

// middleware للتحقق من الصلاحيات
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    const session = activeSessions.get(req.sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }
    
    if (requiredRole === 'admin' && session.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  };
};

// Basic Authentication مع إدارة المستخدمين
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return showLoginPage(res, '');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  // التحقق من صحة المستخدم
  const user = validateUser(username, password);
  
  if (user) {
    // إنشاء أو تحديث الجلسة
    const sessionId = createSessionId(user.username);
    const sessionData = {
      username: user.username,
      role: user.role,
      lastActivity: Date.now(),
      loginTime: Date.now(),
      userId: user.id
    };
    
    activeSessions.set(sessionId, sessionData);
    
    // إضافة معلومات الجلسة للطلب
    req.sessionId = sessionId;
    req.user = user;
    req.sessionData = sessionData;
    
    console.log(`✅ User authenticated: ${user.username} (${user.role}) - Session: ${sessionId.substring(0, 15)}...`);
    next();
  } else {
    console.log(`❌ Authentication failed for: ${username || 'undefined'}`);
    return showLoginPage(res, 'اسم المستخدم أو كلمة المرور غير صحيحة');
  }
};

// عرض صفحة تسجيل الدخول
const showLoginPage = (res, errorMessage = '') => {
  const usersList = Array.from(USERS.values())
    .map(user => `${user.username} (${user.role})`)
    .join(', ');
    
  res.set('WWW-Authenticate', 'Basic realm="ERP System"');
  res.status(401).send(`
    <html>
      <head>
        <title>تسجيل الدخول - نظام ERP</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial; text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .login-container { background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; margin: 0 auto; max-width: 500px; backdrop-filter: blur(10px); }
          .error { background: rgba(255,0,0,0.3); padding: 15px; border-radius: 8px; margin: 20px 0; }
          .info { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; }
          .stats { background: rgba(0,255,0,0.2); padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="login-container">
          <h1>🔒 نظام ERP الذكي</h1>
          <p>تحليل الفواتير بالذكاء الاصطناعي + إدارة المخزون</p>
          
          ${errorMessage ? `<div class="error">❌ ${errorMessage}</div>` : ''}
          
          <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
          
          <div class="stats">
            <h3>📊 إحصائيات النظام</h3>
            <p>👥 إجمالي المستخدمين: ${USERS.size}</p>
            <p>🟢 المستخدمين النشطين: ${activeSessions.size}</p>
            <p>⏰ مدة الجلسة: ${SESSION_TIMEOUT / 1000 / 60} دقيقة</p>
          </div>
          
          <div class="info">
            <strong>المستخدمين المسجلين:</strong><br>
            ${usersList || 'لا يوجد مستخدمين'}
          </div>
        </div>
      </body>
    </html>
  `);
};

// إعداد CORS و Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// تطبيق الحماية على جميع المسارات
app.use((req, res, next) => {
  const publicPaths = ['/health', '/debug', '/api/stats'];
  
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  // تنظيف الجلسات المنتهية قبل التحقق
  cleanupExpiredSessions();
  
  authenticateUser(req, res, next);
});

// =============================================================================
// API العامة (بدون حماية)
// =============================================================================

// API للإحصائيات
app.get('/api/stats', async (req, res) => {
  cleanupExpiredSessions();
  
  try {
    const dbStats = await statsQueries.getOverview();
    
    res.json({
      ...dbStats,
      totalUsers: USERS.size,
      activeSessions: activeSessions.size,
      serverTime: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.json({
      products: 0,
      orders: 0,
      customers: 0,
      revenue: 0,
      totalUsers: USERS.size,
      activeSessions: activeSessions.size,
      serverTime: new Date().toISOString(),
      uptime: process.uptime()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    users: USERS.size,
    activeSessions: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// API إدارة المنتجات (محمية)
// =============================================================================

// إضافة منتج جديد
app.post('/api/products', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const { name, description, sku, price, cost_price, quantity, category_id, supplier_id } = req.body;
    
    // التحقق من صحة البيانات
    if (!name || !price) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم المنتج والسعر مطلوبان' 
      });
    }
    
    const result = await productQueries.create({
      name, description, sku, 
      price: parseFloat(price), 
      cost_price: parseFloat(cost_price) || 0,
      quantity: parseInt(quantity) || 0,
      category_id: parseInt(category_id) || 1,
      supplier_id: parseInt(supplier_id) || null
    });
    
    console.log(`✅ Product added by ${req.user.username}: ${name}`);
    res.json({ success: true, product: result.rows[0] });
    
  } catch (error) {
    console.error('خطأ في إضافة المنتج:', error);
    res.status(500).json({ 
      success: false, 
      error: error.code === '23505' ? 'رقم المنتج (SKU) موجود مسبقاً' : 'خطأ في إضافة المنتج'
    });
  }
});

// الحصول على جميع المنتجات
app.get('/api/products', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const search = req.query.search;
    
    let result;
    if (search) {
      result = await productQueries.search(search);
    } else {
      result = await productQueries.getAll(limit, offset);
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('خطأ في جلب المنتجات:', error);
    res.status(500).json({ error: 'خطأ في جلب المنتجات' });
  }
});

// الحصول على منتج واحد
app.get('/api/products/:id', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const { id } = req.params;
    const result = await productQueries.getById(id);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('خطأ في جلب المنتج:', error);
    res.status(500).json({ error: 'خطأ في جلب المنتج' });
  }
});

// تحديث منتج
app.put('/api/products/:id', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const { id } = req.params;
    const { name, description, price, quantity, category_id } = req.body;
    
    const result = await query(
      `UPDATE products SET 
        name = $1, description = $2, price = $3, quantity = $4, 
        category_id = $5, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6 AND is_active = true RETURNING *`,
      [name, description, parseFloat(price), parseInt(quantity), parseInt(category_id), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    console.log(`✅ Product updated by ${req.user.username}: ${name}`);
    res.json({ success: true, product: result.rows[0] });
  } catch (error) {
    console.error('خطأ في تحديث المنتج:', error);
    res.status(500).json({ error: 'خطأ في تحديث المنتج' });
  }
});

// حذف منتج (إلغاء تفعيل)
app.delete('/api/products/:id', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const { id } = req.params;
    
    const result = await query(
      'UPDATE products SET is_active = false WHERE id = $1 RETURNING name',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    console.log(`🗑️ Product deactivated by ${req.user.username}: ${result.rows[0].name}`);
    res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
  } catch (error) {
    console.error('خطأ في حذف المنتج:', error);
    res.status(500).json({ error: 'خطأ في حذف المنتج' });
  }
});

// =============================================================================
// API إدارة الطلبات (محمية)
// =============================================================================

// إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const orderData = {
      ...req.body,
      user_id: req.user.id
    };
    
    const order = await orderQueries.create(orderData);
    
    console.log(`✅ Order created by ${req.user.username}: ${order.order_number}`);
    res.json({ success: true, order });
  } catch (error) {
    console.error('خطأ في إنشاء الطلب:', error);
    res.status(500).json({ error: 'خطأ في إنشاء الطلب' });
  }
});

// الحصول على جميع الطلبات
app.get('/api/orders', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await orderQueries.getAll(limit, offset);
    res.json(result.rows);
  } catch (error) {
    console.error('خطأ في جلب الطلبات:', error);
    res.status(500).json({ error: 'خطأ في جلب الطلبات' });
  }
});

// =============================================================================
// API تحليل الفواتير بالذكاء الاصطناعي (محمية)
// =============================================================================

const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم'), false);
    }
  }
});

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const modelName = process.env.OPENAI_MODEL || 'gpt-4';

async function extractText(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);
    return pdfData.text;
  } else if (mimetype.startsWith('image/')) {
    const { data: { text } } = await Tesseract.recognize(filePath, 'ara+eng');
    return text;
  } else {
    throw new Error(`Unsupported file type: ${mimetype}`);
  }
}

// تحليل الفواتير وحفظها في قاعدة البيانات
app.post('/api/analyze-invoice', upload.single('invoice'), async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  if (!openai) {
    return res.status(500).json({ 
      success: false, 
      error: 'OpenAI API key not configured' 
    });
  }

  console.log(`🔄 Starting invoice analysis by user: ${req.user.username}`);
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const { path: filePath, mimetype, originalname, size } = req.file;
    console.log(`📁 File: ${originalname} - ${mimetype} - User: ${req.user.username}`);

    let rawText;
    try {
      rawText = await extractText(filePath, mimetype);
    } catch (extractError) {
      console.error('❌ Text extraction error:', extractError.message);
      return res.status(422).json({ 
        success: false, 
        error: `Failed to read file: ${extractError.message}` 
      });
    }

    if (!rawText || rawText.trim().length < 10) {
      return res.status(422).json({ 
        success: false, 
        error: 'Could not extract sufficient text from invoice' 
      });
    }

    console.log(`📝 Text extracted: ${rawText.length} characters`);

    // تحليل الفاتورة بالذكاء الاصطناعي
    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `Extract invoice data and return as JSON with these fields: 
          supplier, invoiceNumber, date (YYYY-MM-DD), amountBeforeTax, taxAmount, totalAmount, currency, items (array with name, quantity, price)`
        },
        { 
          role: 'user', 
          content: `Analyze this Arabic/English invoice and extract structured data:\n\n${rawText}` 
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    let aiData;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Error processing AI response' 
      });
    }

    // حفظ الفاتورة في قاعدة البيانات
    const invoiceResult = await query(`
      INSERT INTO invoices (
        file_name, file_type, file_size, supplier_name, invoice_number, 
        invoice_date, total_amount, tax_amount, currency, extracted_text, 
        ai_analysis, processing_status, confidence_score, created_by, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP) 
      RETURNING *`,
      [
        originalname,
        mimetype,
        size,
        aiData.supplier || 'غير محدد',
        aiData.invoiceNumber || 'غير محدد',
        aiData.date || new Date().toISOString().split('T')[0],
        parseFloat(aiData.totalAmount) || 0,
        parseFloat(aiData.taxAmount) || 0,
        aiData.currency || 'SAR',
        rawText,
        JSON.stringify(aiData),
        'completed',
        85.0, // نسبة ثقة افتراضية
        req.user.id
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // حفظ عناصر الفاتورة إذا وجدت
    if (aiData.items && Array.isArray(aiData.items)) {
      for (const item of aiData.items) {
        await query(`
          INSERT INTO invoice_items (
            invoice_id, product_name, description, quantity, unit_price, total_price, confidence_score
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            invoiceId,
            item.name || item.product_name || 'غير محدد',
            item.description || '',
            parseFloat(item.quantity) || 0,
            parseFloat(item.price) || parseFloat(item.unit_price) || 0,
            parseFloat(item.total) || parseFloat(item.total_price) || 0,
            80.0
          ]
        );
      }
    }

    // تنظيف الملف المؤقت
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (deleteError) {
      console.warn('⚠️ Failed to delete temp file');
    }

    const responseData = {
      id: invoiceId,
      supplier: aiData.supplier || 'غير محدد',
      invoiceNumber: aiData.invoiceNumber || 'غير محدد',
      date: aiData.date || new Date().toISOString().split('T')[0],
      amountBeforeTax: parseFloat(aiData.amountBeforeTax) || 0,
      taxAmount: parseFloat(aiData.taxAmount) || 0,
      totalAmount: parseFloat(aiData.totalAmount) || 0,
      currency: aiData.currency || 'SAR',
      items: aiData.items || [],
      processedBy: req.user.username,
      processedAt: new Date().toISOString()
    };

    console.log(`✅ Invoice analyzed and saved by ${req.user.username}: ${aiData.invoiceNumber}`);
    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error('❌ Invoice analysis error:', error.message);
    
    // تنظيف الملف في حالة الخطأ
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete file after error');
      }
    }

    res.status(500).json({ 
      success: false, 
      error: 'خطأ غير متوقع في تحليل الفاتورة'
    });
  }
});

// الحصول على الفواتير المحللة
app.get('/api/invoices', async (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await query(`
      SELECT i.*, u.username as processed_by_name 
      FROM invoices i 
      LEFT JOIN users u ON i.created_by = u.id 
      ORDER BY i.created_at DESC 
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('خطأ في جلب الفواتير:', error);
    res.status(500).json({ error: 'خطأ في جلب الفواتير' });
  }
});

// =============================================================================
// الصفحات الرئيسية (محمية)
// =============================================================================

// الصفحة الرئيسية
app.get('/', (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  try {
    const homePath = path.join(__dirname, 'public', 'home.html');
    if (fs.existsSync(homePath)) {
      res.sendFile(homePath);
    } else {
      // صفحة افتراضية محسّنة
      const sessionData = activeSessions.get(req.sessionId);
      const timeLeft = sessionData ? 
        Math.round((SESSION_TIMEOUT - (Date.now() - sessionData.lastActivity)) / 1000 / 60) : 0;
      
      res.send(`
        <html>
        <head>
          <title>نظام ERP الذكي</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial; margin: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 15px; margin-bottom: 20px; backdrop-filter: blur(10px); }
            .card { background: rgba(255,255,255,0.1); padding: 20px; border-radius: 15px; margin: 10px 0; backdrop-filter: blur(10px); }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .feature { text-align: center; padding: 20px; }
            .feature i { font-size: 3rem; margin-bottom: 10px; color: #4CAF50; }
            .links a { display: inline-block; margin: 10px; padding: 15px 25px; background: rgba(255,255,255,0.2); color: white; text-decoration: none; border-radius: 10px; transition: all 0.3s; }
            .links a:hover { background: rgba(255,255,255,0.3); transform: translateY(-2px); }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
            .stat-card { background: rgba(0,255,0,0.2); padding: 15px; border-radius: 10px; text-align: center; }
          </style>
          <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1><i class="fas fa-robot"></i> نظام ERP الذكي</h1>
              <p>تحليل الفواتير بالذكاء الاصطناعي + إدارة المخزون المتكاملة</p>
            </div>
            
            <div class="card">
              <h2>👤 معلومات المستخدم</h2>
              <p><strong>الاسم:</strong> ${req.user.username}</p>
              <p><strong>الصلاحية:</strong> ${req.user.role}</p>
              <p><strong>الوقت المتبقي:</strong> ${timeLeft} دقيقة</p>
            </div>
            
            <div class="grid">
              <div class="card feature">
                <i class="fas fa-brain"></i>
                <h3>تحليل الفواتير الذكي</h3>
                <p>تحليل الفواتير باستخدام OpenAI وحفظها في قاعدة البيانات</p>
              </div>
              
              <div class="card feature">
                <i class="fas fa-boxes"></i>
                <h3>إدارة المخزون</h3>
                <p>إدارة شاملة للمنتجات والكميات والفئات</p>
              </div>
              
              <div class="card feature">
                <i class="fas fa-chart-line"></i>
                <h3>التقارير والإحصائيات</h3>
                <p>تقارير مفصلة وإحصائيات مباشرة من قاعدة البيانات</p>
              </div>
            </div>
            
            <div class="card links">
              <h2>🔗 الوصول السريع</h2>
              <a href="/add"><i class="fas fa-plus"></i> إضافة منتج</a>
              <a href="/view"><i class="fas fa-list"></i> عرض المنتجات</a>
              <a href="/purchase-orders"><i class="fas fa-shopping-cart"></i> أوامر الشراء</a>
              <a href="/api/stats" target="_blank"><i class="fas fa-chart-bar"></i> الإحصائيات</a>
              ${req.user.role === 'admin' ? '<a href="/admin"><i class="fas fa-cog"></i> لوحة الإدارة</a>' : ''}
              <a href="/logout"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</a>
            </div>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Error serving home page:', error);
    res.status(500).send('خطأ في تحميل الصفحة الرئيسية');
  }
});

// باقي المسارات الموجودة (admin, logout, debug, إلخ)
app.get('/admin', requireRole('admin'), (req, res) => {
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  const sessions = Array.from(activeSessions.entries()).map(([id, data]) => ({
    sessionId: id.substring(0, 15) + '...',
    username: data.username,
    role: data.role,
    loginTime: new Date(data.loginTime).toLocaleString('ar-SA'),
    lastActivity: new Date(data.lastActivity).toLocaleString('ar-SA'),
    timeLeft: Math.max(0, Math.round((SESSION_TIMEOUT - (Date.now() - data.lastActivity)) / 1000 / 60))
  }));
  
  res.send(`
    <html>
    <head>
      <title>لوحة تحكم الإدارة</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .card { background: white; padding: 20px; border-radius: 10px; margin: 10px 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 12px; text-align: right; border-bottom: 1px solid #ddd; }
        th { background: #34495e; color: white; }
        .online { color: #27ae60; font-weight: bold; }
        .admin { color: #e74c3c; font-weight: bold; }
        .user { color: #3498db; }
        .btn { padding: 8px 15px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; }
        .btn-primary { background: #3498db; color: white; }
      </style>
      <script>
        setInterval(() => window.location.reload(), 60000);
      </script>
    </head>
    <body>
      <div class="header">
        <h1>🛡️ لوحة تحكم الإدارة - نظام ERP الذكي</h1>
        <p>مرحباً ${req.user.username} - آخر تحديث: ${new Date().toLocaleString('ar-SA')}</p>
      </div>
      
      <div class="card">
        <h2>📊 إحصائيات النظام</h2>
        <p><strong>إجمالي المستخدمين:</strong> ${USERS.size}</p>
        <p><strong>المستخدمين النشطين:</strong> ${activeSessions.size}</p>
        <p><strong>مدة الجلسة:</strong> ${SESSION_TIMEOUT / 1000 / 60} دقيقة</p>
        <p><strong>قاعدة البيانات:</strong> ✅ Railway PostgreSQL</p>
        <p><strong>الذكاء الاصطناعي:</strong> ${!!openai ? '✅ OpenAI متصل' : '❌ غير متاح'}</p>
      </div>
      
      <div class="card">
        <h2>👥 المستخدمين المسجلين</h2>
        <table>
          <tr><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th></tr>
          ${Array.from(USERS.values()).map(user => {
            const isOnline = Array.from(activeSessions.values()).some(s => s.username === user.username);
            return `<tr>
              <td>${user.username}</td>
              <td class="${user.role}">${user.role}</td>
              <td class="${isOnline ? 'online' : ''}">${isOnline ? '🟢 نشط' : '⚫ غير نشط'}</td>
            </tr>`;
          }).join('')}
        </table>
      </div>
      
      <div class="card">
        <h2>🔐 الجلسات النشطة</h2>
        <table>
          <tr><th>المستخدم</th><th>الصلاحية</th><th>وقت الدخول</th><th>آخر نشاط</th><th>الوقت المتبقي</th></tr>
          ${sessions.map(session => `
            <tr>
              <td>${session.username}</td>
              <td class="${session.role}">${session.role}</td>
              <td>${session.loginTime}</td>
              <td>${session.lastActivity}</td>
              <td>${session.timeLeft} دقيقة</td>
            </tr>
          `).join('')}
        </table>
      </div>
      
      <div class="card">
        <h2>🔧 الإجراءات</h2>
        <button class="btn btn-primary" onclick="window.location.href='/'">الصفحة الرئيسية</button>
        <button class="btn btn-primary" onclick="window.location.href='/api/stats'">الإحصائيات</button>
        <button class="btn btn-primary" onclick="window.location.href='/api/products'">المنتجات</button>
        <button class="btn btn-primary" onclick="window.location.href='/api/invoices'">الفواتير</button>
      </div>
    </body>
    </html>
  `);
});

// باقي المسارات (logout, debug, ping)
app.get('/logout', (req, res) => {
  if (req.sessionId && activeSessions.has(req.sessionId)) {
    const sessionData = activeSessions.get(req.sessionId);
    activeSessions.delete(req.sessionId);
    console.log(`🚪 User logged out: ${sessionData.username} (${sessionData.role})`);
  }
  
  res.set('WWW-Authenticate', 'Basic realm="ERP System"');
  res.status(401).send(`
    <html>
      <head>
        <title>تسجيل الخروج</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .container { background: rgba(255,255,255,0.1); padding: 40px; border-radius: 15px; backdrop-filter: blur(10px); }
          .btn { padding: 15px 30px; margin: 10px; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
          .btn-primary { background: #3498db; color: white; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>👋 تم تسجيل الخروج بنجاح</h1>
          <p>شكراً لاستخدام نظام ERP الذكي</p>
          <p style="color: #bdc3c7;">تم حذف جلستك من الخادم وإنهاء جميع الصلاحيات</p>
          <div style="margin-top: 30px;">
            <a href="/" class="btn btn-primary">تسجيل دخول جديد</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

app.get('/ping', (req, res) => {
  if (req.sessionId && activeSessions.has(req.sessionId)) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  res.json({ 
    status: 'OK', 
    message: 'ERP System with AI Invoice Analysis + Database',
    timestamp: new Date().toISOString(),
    currentUser: {
      username: req.user.username,
      role: req.user.role
    },
    features: {
      database: '✅ Railway PostgreSQL',
      ai: !!openai ? '✅ OpenAI Connected' : '❌ Not Available',
      multiUser: '✅ Multi-user with sessions',
      invoiceAnalysis: '✅ PDF & Image support'
    }
  });
});

// معالج الأخطاء
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: error.message || 'Server error'
  });
});

// تنظيف الجلسات عند إيقاف الخادم
process.on('SIGTERM', () => {
  console.log('🔄 Server shutting down, clearing all sessions');
  activeSessions.clear();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 Server shutting down, clearing all sessions');
  activeSessions.clear();
  process.exit(0);
});

// إنشاء مجلد uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// تشغيل الخادم
app.listen(port, '0.0.0.0', async () => {
  console.log(`\n🎉 ERP System with AI started successfully!`);
  console.log(`✅ Port: ${port}`);
  console.log(`👥 Registered users: ${USERS.size}`);
  console.log(`🔐 Session timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);
  console.log(`🤖 OpenAI: ${!!openai ? 'Configured ✅' : 'Missing ❌'}`);
  console.log(`💾 Database: Initializing...`);
  
  // تهيئة قاعدة البيانات
  await initializeDatabase();
  
  console.log(`\n📋 User List:`);
  USERS.forEach((user, key) => {
    console.log(`  • ${user.username} (${user.role})`);
  });
  
  console.log(`\n🚀 Features:`);
  console.log(`  • 🤖 AI Invoice Analysis (PDF + Images)`);
  console.log(`  • 📊 Inventory Management`);
  console.log(`  • 👥 Multi-user with role-based access`);
  console.log(`  • 💾 Railway PostgreSQL Database`);
  console.log(`  • 🔐 Session management`);
  
  console.log(`\n⚡ Server ready to accept requests...\n`);
});
