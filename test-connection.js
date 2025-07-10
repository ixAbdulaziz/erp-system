// test-connection.js
import { testConnection } from './database/connection.js';

console.log('🔄 اختبار الاتصال بقاعدة البيانات PostgreSQL...\n');

try {
  const isConnected = await testConnection();
  
  if (isConnected) {
    console.log('\n🎉 نجح الاختبار!');
    console.log('✅ قاعدة البيانات جاهزة للاستخدام');
    console.log('✅ يمكن المتابعة للخطوة التالية');
  } else {
    console.log('\n❌ فشل الاختبار!');
    console.log('🔧 تحقق من:');
    console.log('  - متغير DATABASE_URL في Railway');
    console.log('  - اتصال الإنترنت');
    console.log('  - صحة بيانات قاعدة البيانات');
  }
  
  process.exit(isConnected ? 0 : 1);
} catch (error) {
  console.error('\n💥 خطأ غير متوقع:', error.message);
  process.exit(1);
}