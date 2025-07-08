import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

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
  
  // طريقة تعريف المستخدمين في Railway Variables:
  // USER_1=username:password:role
  // USER_2=abdulaziz:Aa@210658:admin
  // USER_3=ahmad:123456:user
  // إلخ...
  
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
        <script>
          // تحديث الإحصائيات كل 30 ثانية
          setInterval(() => {
            fetch('/api/stats')
              .then(r => r.json())
              .then(data => {
                document.getElementById('activeUsers').textContent = data.activeSessions;
                document.getElementById('totalUsers').textContent = data.totalUsers;
              })
              .catch(e => console.log('Stats update failed'));
          }, 30000);
        </script>
      </head>
      <body>
        <div class="login-container">
          <h1>🔒 نظام ERP متعدد المستخدمين</h1>
          
          ${errorMessage ? `<div class="error">❌ ${errorMessage}</div>` : ''}
          
          <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
          
          <div class="stats">
            <h3>📊 إحصائيات النظام</h3>
            <p>👥 إجمالي المستخدمين: <span id="totalUsers">${USERS.size}</span></p>
            <p>🟢 المستخدمين النشطين: <span id="activeUsers">${activeSessions.size}</span></p>
            <p>⏰ مدة الجلسة: ${SESSION_TIMEOUT / 1000 / 60} دقيقة</p>
          </div>
          
          <div class="info">
            <strong>المستخدمين المسجلين:</strong><br>
            ${usersList || 'لا يوجد مستخدمين'}
          </div>
          
          <div style="margin-top: 20px;">
            <button onclick="window.location.reload()" style="padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; background: #4CAF50; color: white; cursor: pointer;">إعادة المحاولة</button>
          </div>
        </div>
      </body>
    </html>
  `);
};

// إعداد CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
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

// API للإحصائيات (عام - بدون حماية)
app.get('/api/stats', (req, res) => {
  cleanupExpiredSessions();
  res.json({
    totalUsers: USERS.size,
    activeSessions: activeSessions.size,
    serverTime: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// معلومات النظام (محمي)
app.get('/debug', (req, res) => {
  cleanupExpiredSessions();
  
  const sessions = Array.from(activeSessions.entries()).map(([id, data]) => ({
    sessionId: id.substring(0, 20) + '...',
    username: data.username,
    role: data.role,
    loginTime: new Date(data.loginTime).toISOString(),
    lastActivity: new Date(data.lastActivity).toISOString(),
    timeLeft: Math.max(0, Math.round((SESSION_TIMEOUT - (Date.now() - data.lastActivity)) / 1000 / 60)) + ' minutes'
  }));
  
  const users = Array.from(USERS.values()).map(user => ({
    username: user.username,
    role: user.role,
    id: user.id
  }));

  res.json({
    timestamp: new Date().toISOString(),
    sessionTimeout: SESSION_TIMEOUT / 1000 / 60 + ' minutes',
    activeSessions: sessions,
    registeredUsers: users,
    environment: process.env.NODE_ENV || 'development'
  });
});

// لوحة تحكم الإدارة (للأدمن فقط)
app.get('/admin', requireRole('admin'), (req, res) => {
  // تحديث وقت آخر نشاط
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
        .btn-danger { background: #e74c3c; color: white; }
        .btn-primary { background: #3498db; color: white; }
      </style>
      <script>
        setInterval(() => window.location.reload(), 60000); // تحديث كل دقيقة
      </script>
    </head>
    <body>
      <div class="header">
        <h1>🛡️ لوحة تحكم الإدارة</h1>
        <p>مرحباً ${req.user.username} - آخر تحديث: ${new Date().toLocaleString('ar-SA')}</p>
      </div>
      
      <div class="card">
        <h2>📊 إحصائيات النظام</h2>
        <p><strong>إجمالي المستخدمين:</strong> ${USERS.size}</p>
        <p><strong>المستخدمين النشطين:</strong> ${activeSessions.size}</p>
        <p><strong>مدة الجلسة:</strong> ${SESSION_TIMEOUT / 1000 / 60} دقيقة</p>
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
        <button class="btn btn-primary" onclick="window.location.href='/debug'">معلومات تقنية</button>
        <button class="btn btn-danger" onclick="window.location.href='/logout'">تسجيل الخروج</button>
      </div>
    </body>
    </html>
  `);
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
  // تحديث وقت آخر نشاط
  if (req.sessionId) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  const sessionData = activeSessions.get(req.sessionId);
  const timeLeft = sessionData ? 
    Math.round((SESSION_TIMEOUT - (Date.now() - sessionData.lastActivity)) / 1000 / 60) : 0;
  
  try {
    const homePath = path.join(__dirname, 'public', 'home.html');
    if (fs.existsSync(homePath)) {
      res.sendFile(homePath);
    } else {
      res.send(`
        <html>
        <head>
          <title>ERP System</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial; margin: 20px; background: #f8f9fa; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
            .card { background: white; padding: 20px; border-radius: 10px; margin: 10px 0; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .timer { font-size: 18px; color: #e74c3c; font-weight: bold; }
            .admin { color: #e74c3c; }
            .user { color: #3498db; }
            .links a { display: inline-block; margin: 10px; padding: 10px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; }
            .links a:hover { background: #2980b9; }
            .logout { background: #e74c3c !important; }
            .admin-link { background: #9b59b6 !important; }
          </style>
          <script>
            let timeLeft = ${timeLeft};
            const updateTimer = () => {
              const timerElement = document.getElementById('timeLeft');
              if (timerElement) {
                timerElement.textContent = timeLeft > 0 ? timeLeft + ' دقيقة' : 'منتهية';
                if (timeLeft <= 5 && timeLeft > 0) {
                  timerElement.style.color = '#e74c3c';
                  timerElement.style.animation = 'blink 1s infinite';
                }
                if (timeLeft <= 0) {
                  alert('انتهت صلاحية الجلسة!');
                  window.location.href = '/logout';
                }
              }
              timeLeft--;
            };
            setInterval(updateTimer, 60000); // كل دقيقة
            setTimeout(updateTimer, 100);
            
            // إضافة تأثير وميض للعداد
            const style = document.createElement('style');
            style.textContent = '@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0.3; } }';
            document.head.appendChild(style);
          </script>
        </head>
        <body>
          <div class="header">
            <h1>🎉 مرحباً بك في نظام ERP</h1>
            <p>✅ تم تسجيل الدخول بنجاح!</p>
          </div>
          
          <div class="card">
            <h2>👤 معلومات المستخدم</h2>
            <p><strong>الاسم:</strong> ${req.user.username}</p>
            <p><strong>الصلاحية:</strong> <span class="${req.user.role}">${req.user.role}</span></p>
            <p><strong>وقت الدخول:</strong> ${new Date(sessionData.loginTime).toLocaleString('ar-SA')}</p>
          </div>
          
          <div class="card">
            <h2>🕐 معلومات الجلسة</h2>
            <p><strong>الوقت المتبقي:</strong> <span id="timeLeft" class="timer">${timeLeft} دقيقة</span></p>
            <p><strong>مدة الجلسة:</strong> ${SESSION_TIMEOUT / 1000 / 60} دقيقة</p>
            <p><strong>آخر نشاط:</strong> ${new Date().toLocaleString('ar-SA')}</p>
            <p><strong>المستخدمين النشطين:</strong> ${activeSessions.size}</p>
          </div>
          
          <div class="card links">
            <h2>🔗 الوصول السريع</h2>
            <a href="/ping">اختبار الخادم</a>
            <a href="/debug">معلومات النظام</a>
            ${req.user.role === 'admin' ? '<a href="/admin" class="admin-link">لوحة تحكم الإدارة</a>' : ''}
            <a href="/logout" class="logout">تسجيل الخروج</a>
          </div>
          
          <div class="card">
            <h3>ℹ️ ملاحظات مهمة</h3>
            <ul style="text-align: right; color: #666;">
              <li>سيتم تسجيل الخروج تلقائياً بعد ${SESSION_TIMEOUT / 1000 / 60} دقيقة من عدم النشاط</li>
              <li>يتم تحديث وقت النشاط مع كل طلب للخادم</li>
              <li>المستخدمين الإداريين لهم صلاحيات إضافية</li>
              ${req.user.role === 'admin' ? '<li style="color: #e74c3c;">أنت مستخدم إداري - يمكنك الوصول للوحة التحكم</li>' : ''}
            </ul>
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

// تسجيل الخروج
app.get('/logout', (req, res) => {
  // حذف الجلسة
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
          <p>شكراً لاستخدام نظام ERP</p>
          <p style="color: #bdc3c7;">تم حذف جلستك من الخادم وإنهاء جميع الصلاحيات</p>
          <div style="margin-top: 30px;">
            <a href="/" class="btn btn-primary">تسجيل دخول جديد</a>
          </div>
        </div>
      </body>
    </html>
  `);
});

// نقطة فحص الخادم
app.get('/ping', (req, res) => {
  // تحديث وقت آخر نشاط
  if (req.sessionId && activeSessions.has(req.sessionId)) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  res.json({ 
    status: 'OK', 
    message: 'Server is running with multi-user support!',
    timestamp: new Date().toISOString(),
    currentUser: {
      username: req.user.username,
      role: req.user.role,
      sessionId: req.sessionId?.substring(0, 15) + '...'
    },
    systemStats: {
      totalUsers: USERS.size,
      activeSessions: activeSessions.size,
      sessionTimeout: SESSION_TIMEOUT / 1000 / 60 + ' minutes'
    }
  });
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

// API لإدارة المستخدمين (للأدمن فقط)
app.get('/api/users', requireRole('admin'), (req, res) => {
  const users = Array.from(USERS.values()).map(user => ({
    username: user.username,
    role: user.role,
    id: user.id,
    isOnline: Array.from(activeSessions.values()).some(s => s.username === user.username)
  }));
  
  res.json({ success: true, users });
});

// باقي الكود للـ invoice analysis...
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

// API endpoint لتحليل الفواتير
app.post('/api/analyze-invoice', upload.single('invoice'), async (req, res) => {
  // تحديث وقت آخر نشاط
  if (req.sessionId && activeSessions.has(req.sessionId)) {
    activeSessions.get(req.sessionId).lastActivity = Date.now();
  }
  
  if (!openai) {
    return res.status(500).json({ 
      success: false, 
      error: 'OpenAI API key not configured' 
    });
  }

  console.log(`🔄 Starting invoice analysis by user: ${req.user.username} (${req.user.role})`);
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const { path: filePath, mimetype, originalname } = req.file;
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
    } finally {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete temp file');
      }
    }

    if (!rawText || rawText.trim().length < 10) {
      return res.status(422).json({ 
        success: false, 
        error: 'Could not extract sufficient text from invoice' 
      });
    }

    console.log(`📝 Text extracted: ${rawText.length} characters`);

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: `Extract invoice data and return as JSON with these fields: supplier, type, invoiceNumber, date (YYYY-MM-DD), amountBeforeTax, taxAmount, totalAmount`
        },
        { 
          role: 'user', 
          content: `Analyze this invoice:\n\n${rawText}` 
        }
      ],
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    let data;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError.message);
      return res.status(500).json({ 
        success: false, 
        error: 'Error processing data' 
      });
    }

    const cleanData = {
      supplier: data.supplier || 'غير محدد',
      type: data.type || 'فاتورة عامة',
      invoiceNumber: data.invoiceNumber || 'غير محدد',
      date: data.date || new Date().toISOString().split('T')[0],
      amountBeforeTax: parseFloat(data.amountBeforeTax) || 0,
      taxAmount: parseFloat(data.taxAmount) || 0,
      totalAmount: parseFloat(data.totalAmount) || 0,
      processedBy: req.user.username,
      processedAt: new Date().toISOString()
    };

    console.log(`✅ Invoice analyzed successfully by ${req.user.username}`);
    res.json({ success: true, data: cleanData });

  } catch (error) {
    console.error('❌ Invoice analysis error:', error.message);
    
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.warn('⚠️ Failed to delete file after error');
      }
    }

    res.status(500).json({ 
      success: false, 
      error: 'Unexpected error occurred'
    });
  }
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
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🎉 Multi-user ERP System started successfully!`);
  console.log(`✅ Port: ${port}`);
  console.log(`👥 Registered users: ${USERS.size}`);
  console.log(`🔐 Session timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);
  console.log(`🤖 OpenAI: ${!!process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
  
  console.log(`\n📋 User List:`);
  USERS.forEach((user, key) => {
    console.log(`  • ${user.username} (${user.role})`);
  });
  
  console.log(`\n⚡ Server ready to accept requests...\n`);
});
