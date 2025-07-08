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

console.log(`🚀 Starting server on port: ${port}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// قراءة متغيرات البيئة مع debugging مطور
console.log('🔍 Raw Environment Variables:');
console.log('AUTH_USERNAME exists:', !!process.env.AUTH_USERNAME);
console.log('AUTH_PASSWORD exists:', !!process.env.AUTH_PASSWORD);
console.log('All env vars containing AUTH:', Object.keys(process.env).filter(key => key.includes('AUTH')));

// إعدادات الحماية مع التحقق من عدة احتمالات
let AUTH_USERNAME = process.env.AUTH_USERNAME || process.env.USERNAME || process.env.USER || 'admin';
let AUTH_PASSWORD = process.env.AUTH_PASSWORD || process.env.PASSWORD || 'password123';

// تنظيف القيم
AUTH_USERNAME = AUTH_USERNAME.toString().trim();
AUTH_PASSWORD = AUTH_PASSWORD.toString().trim();

// في حالة Railway، أحياناً المتغيرات تأتي مع أسماء مختلفة
if (!process.env.AUTH_USERNAME && process.env.RAILWAY_STATIC_URL) {
  console.log('🚄 Railway environment detected, trying alternative variable names...');
  AUTH_USERNAME = process.env.USER_NAME || process.env.LOGIN_USER || 'Abdulaziz';
  AUTH_PASSWORD = process.env.USER_PASSWORD || process.env.LOGIN_PASSWORD || 'Aa@210658';
}

// طباعة المتغيرات للـ debugging
console.log('🔍 Final Authentication Settings:');
console.log(`AUTH_USERNAME: "${AUTH_USERNAME}" (length: ${AUTH_USERNAME.length})`);
console.log(`AUTH_PASSWORD: "${AUTH_PASSWORD}" (length: ${AUTH_PASSWORD.length})`);
console.log(`OPENAI_API_KEY exists: ${!!process.env.OPENAI_API_KEY}`);

// Basic Authentication Middleware مع debugging مفصل
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(`🔐 Auth attempt for path: ${req.path}`);
  
  if (!authHeader) {
    console.log('❌ No authorization header found');
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>تسجيل الدخول مطلوب</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🔒 نظام ERP محمي</h1>
          <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
          <div style="background: #f0f8ff; padding: 15px; margin: 20px; border-radius: 5px; font-size: 14px;">
            <strong>معلومات المطور (احذف لاحقاً):</strong><br>
            Expected Username: "${AUTH_USERNAME}"<br>
            Expected Password Length: ${AUTH_PASSWORD.length}<br>
            Server Time: ${new Date().toLocaleString()}<br>
            Environment: ${process.env.NODE_ENV || 'development'}
          </div>
        </body>
      </html>
    `);
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  // debugging مفصل
  console.log(`📝 Login attempt details:`);
  console.log(`  Provided username: "${username}" (length: ${username ? username.length : 0})`);
  console.log(`  Expected username: "${AUTH_USERNAME}" (length: ${AUTH_USERNAME.length})`);
  console.log(`  Username match: ${username === AUTH_USERNAME}`);
  console.log(`  Provided password length: ${password ? password.length : 0}`);
  console.log(`  Expected password length: ${AUTH_PASSWORD.length}`);
  console.log(`  Password match: ${password === AUTH_PASSWORD}`);

  // مقارنات متعددة للتأكد
  const usernameMatch = username && username.trim().toLowerCase() === AUTH_USERNAME.trim().toLowerCase();
  const passwordMatch = password && password.trim() === AUTH_PASSWORD.trim();

  console.log(`  Case-insensitive username match: ${usernameMatch}`);
  console.log(`  Trimmed password match: ${passwordMatch}`);

  if (usernameMatch && passwordMatch) {
    console.log(`✅ User authenticated successfully: ${username}`);
    next();
  } else {
    console.log(`❌ Authentication failed for: ${username || 'undefined'}`);
    
    // تفاصيل أكثر للـ debugging
    if (!usernameMatch) {
      console.log(`  Username issue: "${username?.trim()}" !== "${AUTH_USERNAME.trim()}"`);
    }
    if (!passwordMatch) {
      console.log(`  Password issue: length ${password?.length || 0} vs expected ${AUTH_PASSWORD.length}`);
      // لا نطبع كلمة المرور للأمان، فقط الطول والأحرف الأولى
      console.log(`  Password starts with: "${password?.substring(0, 2)}..." vs expected starts with: "${AUTH_PASSWORD.substring(0, 2)}..."`);
    }
    
    res.set('WWW-Authenticate', 'Basic realm="ERP System"');
    return res.status(401).send(`
      <html>
        <head>
          <title>خطأ في تسجيل الدخول</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>❌ خطأ في تسجيل الدخول</h1>
          <p>اسم المستخدم أو كلمة المرور غير صحيحة</p>
          <div style="background: #fff0f0; padding: 15px; margin: 20px; border-radius: 5px; font-size: 14px;">
            <strong>معلومات المطور (احذف لاحقاً):</strong><br>
            محاولة تسجيل دخول بـ: "${username || 'undefined'}"<br>
            مطلوب: "${AUTH_USERNAME}"<br>
            ${usernameMatch ? '✅ Username صحيح' : '❌ Username خطأ'}<br>
            ${passwordMatch ? '✅ Password صحيح' : '❌ Password خطأ'}<br>
            كلمة المرور المدخلة تبدأ بـ: "${password?.substring(0, 2) || 'undefined'}..."<br>
            المطلوب يبدأ بـ: "${AUTH_PASSWORD.substring(0, 2)}..."
          </div>
          <button onclick="location.reload()">إعادة المحاولة</button>
        </body>
      </html>
    `);
  }
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

// تطبيق الحماية على جميع المسارات (ما عدا المستثناة)
app.use((req, res, next) => {
  // المسارات المستثناة من الحماية
  if (req.path === '/health' || req.path === '/debug') {
    return next();
  }
  
  // تطبيق الحماية على باقي المسارات
  authenticateUser(req, res, next);
});

// صفحة debug للمطورين
app.get('/debug', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: port,
    platform: process.platform,
    nodeVersion: process.version,
    auth: {
      username: AUTH_USERNAME,
      usernameLength: AUTH_USERNAME.length,
      passwordLength: AUTH_PASSWORD.length,
      passwordFirstTwoChars: AUTH_PASSWORD.substring(0, 2),
      hasOpenAI: !!process.env.OPENAI_API_KEY
    },
    envVars: {
      AUTH_USERNAME_exists: !!process.env.AUTH_USERNAME,
      AUTH_PASSWORD_exists: !!process.env.AUTH_PASSWORD,
      RAILWAY_STATIC_URL_exists: !!process.env.RAILWAY_STATIC_URL,
      authRelatedVars: Object.keys(process.env).filter(key => 
        key.toUpperCase().includes('AUTH') || 
        key.toUpperCase().includes('USER') || 
        key.toUpperCase().includes('PASS')
      )
    },
    headers: {
      userAgent: req.headers['user-agent'],
      authorization: req.headers.authorization ? 'Present' : 'Missing'
    }
  });
});

// إعداد multer
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

// تحقق من API key
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const modelName = process.env.OPENAI_MODEL || 'gpt-4';

// الصفحة الرئيسية
app.get('/', (req, res) => {
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
        </head>
        <body style="font-family: Arial; padding: 20px;">
          <h1>🎉 مرحباً بك في نظام ERP المحمي</h1>
          <p>✅ تم تسجيل الدخول بنجاح!</p>
          <p><strong>المستخدم:</strong> ${AUTH_USERNAME}</p>
          <p>الملف home.html غير موجود في مجلد public</p>
          <hr>
          <p><a href="/ping">اختبار الخادم</a></p>
          <p><a href="/debug">معلومات النظام</a> (للمطورين)</p>
          <p><a href="/logout">تسجيل الخروج</a></p>
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
  res.set('WWW-Authenticate', 'Basic realm="ERP System"');
  res.status(401).send(`
    <html>
      <head>
        <title>تسجيل الخروج</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>👋 تم تسجيل الخروج</h1>
        <p>شكراً لاستخدام نظام ERP</p>
        <a href="/">العودة للصفحة الرئيسية</a>
      </body>
    </html>
  `);
});

// نقطة فحص الخادم
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running and protected!',
    timestamp: new Date().toISOString(),
    port: port,
    authenticated: true,
    currentUser: AUTH_USERNAME,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    model: modelName
  });
});

// Health check للـ Railway (بدون حماية)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// باقي الكود للـ invoice analysis...
// (نفس منطق استخراج النص وتحليل الفواتير السابق)

async function extractText(filePath, mimetype) {
  console.log(`📄 Extracting text from: ${mimetype}`);
  
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
  if (!openai) {
    return res.status(500).json({ 
      success: false, 
      error: 'OpenAI API key not configured' 
    });
  }

  console.log('🔄 Starting authenticated invoice analysis...');
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    const { path: filePath, mimetype, originalname } = req.file;
    console.log(`📁 File: ${originalname} - ${mimetype}`);

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

    console.log(`📝 Text length: ${rawText.length} characters`);

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
      totalAmount: parseFloat(data.totalAmount) || 0
    };

    console.log('✅ Invoice analyzed successfully');
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

// إنشاء مجلد uploads
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
  console.log('📁 Created uploads directory');
}

// تشغيل الخادم
app.listen(port, '0.0.0.0', () => {
  console.log(`\n🎉 Server successfully started!`);
  console.log(`✅ Port: ${port}`);
  console.log(`🔐 Authentication enabled`);
  console.log(`👤 Username: "${AUTH_USERNAME}"`);
  console.log(`🗝️ Password length: ${AUTH_PASSWORD.length} characters`);
  console.log(`🌐 Public URL: Check Railway dashboard`);
  console.log(`🔍 Debug endpoint: /debug`);
  console.log(`🤖 OpenAI: ${!!process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`⚡ Ready to accept requests...\n`);
});

process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  process.exit(0);
});
