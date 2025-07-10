// database/connection.js
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// تحميل متغيرات البيئة
dotenv.config();

// إعداد الاتصال بقاعدة البيانات
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: false,
    freezeTableName: true
  }
});

// اختبار الاتصال
export const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ تم الاتصال بقاعدة البيانات PostgreSQL بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في الاتصال بقاعدة البيانات:', error.message);
    return false;
  }
};

// مزامنة قاعدة البيانات
export const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ تم مزامنة جداول قاعدة البيانات بنجاح');
    return true;
  } catch (error) {
    console.error('❌ خطأ في مزامنة قاعدة البيانات:', error.message);
    return false;
  }
};

export default sequelize;