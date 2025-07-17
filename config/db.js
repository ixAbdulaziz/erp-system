// config/db.js

const { Pool } = require('pg');
require('dotenv').config();

// إعداد الاتصال الذي سيتم استخدامه في كل أنحاء التطبيق
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// تصدير الاتصال ليكون متاحًا للملفات الأخرى
module.exports = pool;
