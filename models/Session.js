// models/Session.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/connection.js';

const Session = sequelize.define('Session', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // ربط بالمستخدم
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // نسخة denormalized لاسم المستخدم للأداء
  username: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  // رمز الجلسة الفريد
  token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  // هل الجلسة نشطة؟
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  // آخر نشاط للجلسة
  lastActivity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_activity'
  },
  // عنوان IP (اختياري للأمان)
  ipAddress: {
    type: DataTypes.STRING(45), // يدعم IPv6
    field: 'ip_address'
  },
  // معلومات المتصفح (اختياري)
  userAgent: {
    type: DataTypes.TEXT,
    field: 'user_agent'
  }
}, {
  tableName: 'sessions',
  indexes: [
    {
      unique: true,
      fields: ['token']
    },
    {
      fields: ['user_id']
    },
    {
      fields: ['username']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['last_activity']
    },
    {
      fields: ['created_at']
    }
  ],
  
  // Virtual fields
  getterMethods: {
    // هل الجلسة منتهية الصلاحية؟
    isExpired() {
      if (!this.isActive) return true;
      
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة
      const now = new Date();
      const lastActivity = new Date(this.lastActivity);
      
      return (now - lastActivity) > SESSION_TIMEOUT;
    },
    
    // الوقت المتبقي بالدقائق
    timeRemaining() {
      if (!this.isActive) return 0;
      
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة
      const now = new Date();
      const lastActivity = new Date(this.lastActivity);
      const elapsed = now - lastActivity;
      const remaining = SESSION_TIMEOUT - elapsed;
      
      return Math.max(0, Math.floor(remaining / (1000 * 60)));
    },
    
    // تنسيق آخر نشاط
    formattedLastActivity() {
      return new Date(this.lastActivity).toLocaleString('ar-SA');
    },
    
    // تنسيق وقت إنشاء الجلسة
    formattedLoginTime() {
      return new Date(this.createdAt).toLocaleString('ar-SA');
    }
  },
  
  // الطرق الثابتة
  classMethods: {
    // تنظيف الجلسات المنتهية الصلاحية
    async cleanupExpiredSessions() {
      const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة
      const expireTime = new Date(Date.now() - SESSION_TIMEOUT);
      
      try {
        const result = await this.update(
          { isActive: false },
          {
            where: {
              lastActivity: { [sequelize.Op.lt]: expireTime },
              isActive: true
            }
          }
        );
        
        console.log(`🧹 تم تنظيف ${result[0]} جلسة منتهية الصلاحية`);
        return result[0];
      } catch (error) {
        console.error('❌ خطأ في تنظيف الجلسات:', error.message);
        return 0;
      }
    },
    
    // البحث عن جلسة نشطة بالرمز
    async findActiveSession(token) {
      try {
        const session = await this.findOne({
          where: {
            token: token,
            isActive: true
          }
        });
        
        // تحقق من انتهاء الصلاحية
        if (session && session.isExpired) {
          await session.update({ isActive: false });
          return null;
        }
        
        return session;
      } catch (error) {
        console.error('❌ خطأ في البحث عن الجلسة:', error.message);
        return null;
      }
    }
  },
  
  // Hooks
  hooks: {
    // تحديث آخر نشاط تلقائياً عند الوصول
    beforeUpdate: (session, options) => {
      if (session.changed('isActive') && session.isActive) {
        session.lastActivity = new Date();
      }
    }
  }
});

export default Session;
