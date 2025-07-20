-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS purchase_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE purchase_system;

-- جدول أوامر الشراء الرئيسي
CREATE TABLE purchase_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name VARCHAR(255) NOT NULL COMMENT 'اسم المورد',
    order_date DATE NOT NULL COMMENT 'تاريخ الطلب',
    status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled') DEFAULT 'pending' COMMENT 'حالة الطلب',
    notes TEXT COMMENT 'ملاحظات',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'تاريخ التحديث',
    
    INDEX idx_supplier (supplier_name),
    INDEX idx_status (status),
    INDEX idx_order_date (order_date)
) ENGINE=InnoDB COMMENT='جدول أوامر الشراء';

-- جدول عناصر أوامر الشراء
CREATE TABLE purchase_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_order_id INT NOT NULL COMMENT 'معرف أمر الشراء',
    item_name VARCHAR(255) NOT NULL COMMENT 'اسم الصنف',
    quantity DECIMAL(10,2) NOT NULL COMMENT 'الكمية',
    unit_price DECIMAL(10,2) NOT NULL COMMENT 'سعر الوحدة',
    description TEXT COMMENT 'وصف الصنف',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء',
    
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    INDEX idx_purchase_order (purchase_order_id),
    INDEX idx_item_name (item_name)
) ENGINE=InnoDB COMMENT='جدول عناصر أوامر الشراء';

-- جدول الموردين (اختياري للمستقبل)
CREATE TABLE suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE COMMENT 'اسم المورد',
    contact_person VARCHAR(255) COMMENT 'شخص الاتصال',
    phone VARCHAR(50) COMMENT 'رقم الهاتف',
    email VARCHAR(255) COMMENT 'البريد الإلكتروني',
    address TEXT COMMENT 'العنوان',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'تاريخ الإنشاء',
    
    INDEX idx_name (name)
) ENGINE=InnoDB COMMENT='جدول الموردين';

-- إدراج بيانات تجريبية
INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES
('شركة المواد الأولية المحدودة', 'أحمد محمد', '0501234567', 'ahmed@materials.com', 'الرياض، المملكة العربية السعودية'),
('مؤسسة التقنية الحديثة', 'فاطمة علي', '0509876543', 'fatima@tech.com', 'جدة، المملكة العربية السعودية'),
('شركة الإمدادات الصناعية', 'محمد خالد', '0551234567', 'mohammed@supplies.com', 'الدمام، المملكة العربية السعودية');

-- إدراج أوامر شراء تجريبية
INSERT INTO purchase_orders (supplier_name, order_date, status, notes) VALUES
('شركة المواد الأولية المحدودة', '2024-01-15', 'completed', 'طلب مواد خام للإنتاج'),
('مؤسسة التقنية الحديثة', '2024-01-20', 'pending', 'أجهزة كمبيوتر للمكتب'),
('شركة الإمدادات الصناعية', '2024-01-25', 'confirmed', 'قطع غيار للآلات');

-- إدراج عناصر أوامر الشراء التجريبية
INSERT INTO purchase_order_items (purchase_order_id, item_name, quantity, unit_price, description) VALUES
(1, 'مادة PVC', 100.00, 25.50, 'أنابيب PVC قطر 2 بوصة'),
(1, 'مادة لاصقة', 50.00, 15.75, 'لاصق للأنابيب'),
(2, 'جهاز كمبيوتر مكتبي', 5.00, 2500.00, 'Core i7, 16GB RAM, 512GB SSD'),
(2, 'شاشة LED', 5.00, 800.00, 'شاشة 24 بوصة Full HD'),
(3, 'محرك كهربائي', 2.00, 1200.00, 'محرك 5 حصان'),
(3, 'حزام نقل', 10.00, 45.00, 'حزام مطاطي مقوى');

-- إنشاء views مفيدة
CREATE VIEW order_summary AS
SELECT 
    po.id,
    po.supplier_name,
    po.order_date,
    po.status,
    COUNT(poi.id) as items_count,
    COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total_amount,
    po.created_at
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
GROUP BY po.id, po.supplier_name, po.order_date, po.status, po.created_at;

-- إجراء مخزن للحصول على إحصائيات سريعة
DELIMITER //
CREATE PROCEDURE GetDashboardStats()
BEGIN
    SELECT 
        (SELECT COUNT(*) FROM purchase_orders) as total_orders,
        (SELECT COUNT(*) FROM purchase_orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM purchase_orders WHERE status = 'completed') as completed_orders,
        (SELECT COALESCE(SUM(poi.quantity * poi.unit_price), 0) 
         FROM purchase_order_items poi 
         JOIN purchase_orders po ON poi.purchase_order_id = po.id) as total_amount;
END //
DELIMITER ;
