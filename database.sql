-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS invoice_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE invoice_system;

-- =================== جدول الفواتير ===================
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier VARCHAR(255) NOT NULL COMMENT 'اسم المورد',
    type VARCHAR(100) NOT NULL COMMENT 'نوع الفاتورة',
    category VARCHAR(100) COMMENT 'فئة الفاتورة', 
    invoiceNumber VARCHAR(100) NOT NULL COMMENT 'رقم الفاتورة',
    date DATE NOT NULL COMMENT 'تاريخ الفاتورة',
    amountBeforeTax DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'المبلغ قبل الضريبة',
    taxAmount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'مبلغ الضريبة',
    totalAmount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'المبلغ الإجمالي',
    notes TEXT COMMENT 'ملاحظات',
    
    -- بيانات الملفات
    fileData LONGTEXT COMMENT 'بيانات الملف مُرمزة بـ base64',
    fileType VARCHAR(100) COMMENT 'نوع الملف (MIME type)',
    fileName VARCHAR(255) COMMENT 'اسم الملف',
    fileSize INT COMMENT 'حجم الملف بالبايت',
    
    -- ربط مع أوامر الشراء
    purchaseOrderId VARCHAR(20) COMMENT 'معرف أمر الشراء المرتبط',
    
    -- أوقات الإنشاء والتعديل
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'وقت الإنشاء',
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'وقت التحديث',
    
    -- فهارس لتحسين الأداء
    INDEX idx_supplier (supplier),
    INDEX idx_invoice_number (invoiceNumber),
    INDEX idx_date (date),
    INDEX idx_purchase_order (purchaseOrderId),
    INDEX idx_total_amount (totalAmount),
    
    -- قيود
    UNIQUE KEY unique_invoice_number (invoiceNumber, supplier),
    CONSTRAINT chk_amounts CHECK (amountBeforeTax >= 0 AND taxAmount >= 0 AND totalAmount >= 0)
) ENGINE=InnoDB COMMENT='جدول الفواتير';

-- =================== جدول أوامر الشراء ===================
CREATE TABLE purchase_orders (
    id VARCHAR(20) PRIMARY KEY COMMENT 'معرف أمر الشراء (PO-001, PO-002, ...)',
    supplier VARCHAR(255) NOT NULL COMMENT 'اسم المورد',
    description TEXT NOT NULL COMMENT 'وصف أمر الشراء',
    price DECIMAL(12,2) NOT NULL COMMENT 'سعر أمر الشراء',
    
    -- ملف PDF الخاص بأمر الشراء
    pdfData LONGTEXT COMMENT 'بيانات ملف PDF مُرمزة بـ base64',
    pdfName VARCHAR(255) COMMENT 'اسم ملف PDF',
    pdfSize INT COMMENT 'حجم ملف PDF بالبايت',
    
    -- معلومات أساسية
    createdDate DATE NOT NULL COMMENT 'تاريخ إنشاء الأمر',
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active' COMMENT 'حالة أمر الشراء',
    
    -- أوقات الإنشاء والتعديل
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'وقت الإنشاء',
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'وقت التحديث',
    
    -- فهارس
    INDEX idx_supplier (supplier),
    INDEX idx_created_date (createdDate),
    INDEX idx_status (status),
    INDEX idx_price (price),
    
    -- قيود
    CONSTRAINT chk_price CHECK (price >= 0)
) ENGINE=InnoDB COMMENT='جدول أوامر الشراء';

-- =================== جدول المدفوعات ===================
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier VARCHAR(255) NOT NULL COMMENT 'اسم المورد',
    amount DECIMAL(12,2) NOT NULL COMMENT 'مبلغ الدفعة',
    date DATE NOT NULL COMMENT 'تاريخ الدفعة',
    notes TEXT COMMENT 'ملاحظات الدفعة',
    
    -- أوقات الإنشاء والتعديل
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'وقت الإنشاء',
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'وقت التحديث',
    
    -- فهارس
    INDEX idx_supplier (supplier),
    INDEX idx_date (date),
    INDEX idx_amount (amount),
    
    -- قيود
    CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB COMMENT='جدول المدفوعات';

-- =================== جدول الموردين (اختياري) ===================
CREATE TABLE suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE COMMENT 'اسم المورد',
    contactPerson VARCHAR(255) COMMENT 'شخص الاتصال',
    phone VARCHAR(50) COMMENT 'رقم الهاتف',
    email VARCHAR(255) COMMENT 'البريد الإلكتروني',
    address TEXT COMMENT 'العنوان',
    taxNumber VARCHAR(50) COMMENT 'الرقم الضريبي',
    
    -- أوقات الإنشاء والتعديل
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'وقت الإنشاء',
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'وقت التحديث',
    
    -- فهارس
    INDEX idx_name (name),
    INDEX idx_email (email)
) ENGINE=InnoDB COMMENT='جدول الموردين';

-- =================== إنشاء المفاتيح الخارجية ===================

-- ربط الفواتير بأوامر الشراء
ALTER TABLE invoices 
ADD CONSTRAINT fk_invoice_purchase_order 
FOREIGN KEY (purchaseOrderId) REFERENCES purchase_orders(id) 
ON DELETE SET NULL ON UPDATE CASCADE;

-- =================== إدراج بيانات تجريبية ===================

-- موردين تجريبيين
INSERT INTO suppliers (name, contactPerson, phone, email, address, taxNumber) VALUES
('شركة التقنية المتقدمة', 'أحمد محمد', '0501234567', 'ahmed@tech-advanced.com', 'الرياض، المملكة العربية السعودية', '300123456789001'),
('مؤسسة الإمدادات الصناعية', 'فاطمة علي', '0509876543', 'fatima@industrial-supplies.com', 'جدة، المملكة العربية السعودية', '300987654321001'),
('شركة المواد الخام المحدودة', 'محمد خالد', '0551234567', 'mohammed@raw-materials.com', 'الدمام، المملكة العربية السعودية', '300456789123001');

-- أوامر شراء تجريبية
INSERT INTO purchase_orders (id, supplier, description, price, createdDate, status) VALUES
('PO-001', 'شركة التقنية المتقدمة', 'شراء أجهزة كمبيوتر وطابعات للمكتب الجديد', 25000.00, '2024-01-15', 'active'),
('PO-002', 'مؤسسة الإمدادات الصناعية', 'قطع غيار للآلات والمعدات الصناعية', 15750.50, '2024-01-20', 'active'),
('PO-003', 'شركة المواد الخام المحدودة', 'مواد خام لخط الإنتاج الجديد', 42300.25, '2024-01-25', 'completed');

-- فواتير تجريبية
INSERT INTO invoices (supplier, type, category, invoiceNumber, date, amountBeforeTax, taxAmount, totalAmount, notes, purchaseOrderId) VALUES
('شركة التقنية المتقدمة', 'فاتورة شراء', 'تقنية', 'INV-2024-001', '2024-01-16', 21739.13, 3260.87, 25000.00, 'أجهزة كمبيوتر للمكتب الجديد', 'PO-001'),
('شركة التقنية المتقدمة', 'فاتورة شراء', 'تقنية', 'INV-2024-002', '2024-01-18', 4347.83, 652.17, 5000.00, 'طابعات وإكسسوارات', 'PO-001'),
('مؤسسة الإمدادات الصناعية', 'فاتورة شراء', 'صناعية', 'INV-2024-003', '2024-01-22', 13652.17, 2047.83, 15700.00, 'قطع غيار للآلات', 'PO-002'),
('شركة المواد الخام المحدودة', 'فاتورة شراء', 'مواد خام', 'INV-2024-004', '2024-01-26', 36783.26, 5517.49, 42300.75, 'مواد خام للإنتاج', 'PO-003'),
('شركة التقنية المتقدمة', 'فاتورة خدمة', 'صيانة', 'SRV-2024-001', '2024-02-01', 2173.91, 326.09, 2500.00, 'صيانة دورية للأجهزة', NULL);

-- مدفوعات تجريبية
INSERT INTO payments (supplier, amount, date, notes) VALUES
('شركة التقنية المتقدمة', 15000.00, '2024-01-20', 'دفعة أولى لأجهزة الكمبيوتر'),
('شركة التقنية المتقدمة', 10000.00, '2024-01-25', 'دفعة ثانية والباقي'),
('مؤسسة الإمدادات الصناعية', 8000.00, '2024-01-28', 'دفعة جزئية لقطع الغيار'),
('شركة المواد الخام المحدودة', 20000.00, '2024-01-30', 'دفعة مقدمة للمواد الخام'),
('شركة المواد الخام المحدودة', 22300.75, '2024-02-05', 'تسوية كاملة للفاتورة');

-- =================== إنشاء views مفيدة ===================

-- عرض ملخص الفواتير حسب المورد
CREATE VIEW supplier_invoice_summary AS
SELECT 
    supplier,
    COUNT(*) as invoice_count,
    SUM(totalAmount) as total_invoices,
    AVG(totalAmount) as avg_invoice_amount,
    MIN(date) as first_invoice_date,
    MAX(date) as last_invoice_date
FROM invoices 
GROUP BY supplier;

-- عرض ملخص المدفوعات حسب المورد
CREATE VIEW supplier_payment_summary AS
SELECT 
    supplier,
    COUNT(*) as payment_count,
    SUM(amount) as total_payments,
    AVG(amount) as avg_payment_amount,
    MIN(date) as first_payment_date,
    MAX(date) as last_payment_date
FROM payments 
GROUP BY supplier;

-- عرض الرصيد المستحق لكل مورد
CREATE VIEW supplier_outstanding_balance AS
SELECT 
    COALESCE(i.supplier, p.supplier) as supplier,
    COALESCE(i.total_invoices, 0) as total_invoices,
    COALESCE(p.total_payments, 0) as total_payments,
    COALESCE(i.total_invoices, 0) - COALESCE(p.total_payments, 0) as outstanding_balance,
    COALESCE(i.invoice_count, 0) as invoice_count,
    COALESCE(p.payment_count, 0) as payment_count,
    i.last_invoice_date,
    p.last_payment_date
FROM supplier_invoice_summary i
FULL OUTER JOIN supplier_payment_summary p ON i.supplier = p.supplier;

-- عرض أوامر الشراء مع الفواتير المربوطة
CREATE VIEW purchase_order_details AS
SELECT 
    po.*,
    COUNT(i.id) as linked_invoices_count,
    SUM(i.totalAmount) as linked_invoices_total,
    po.price - COALESCE(SUM(i.totalAmount), 0) as remaining_amount
FROM purchase_orders po
LEFT JOIN invoices i ON po.id = i.purchaseOrderId
GROUP BY po.id;

-- =================== إجراءات مخزنة مفيدة ===================

-- إجراء للحصول على إحصائيات سريعة
DELIMITER //
CREATE PROCEDURE GetDashboardStats()
BEGIN
    SELECT 
        (SELECT COUNT(DISTINCT supplier) FROM invoices WHERE supplier IS NOT NULL) as supplier_count,
        (SELECT COUNT(*) FROM invoices) as invoice_count,
        (SELECT COUNT(*) FROM purchase_orders) as order_count,
        (SELECT COALESCE(SUM(totalAmount), 0) FROM invoices) as total_amount,
        (SELECT COALESCE(SUM(amount), 0) FROM payments) as total_payments,
        (SELECT COALESCE(SUM(totalAmount), 0) - COALESCE((SELECT SUM(amount) FROM payments), 0) FROM invoices) as outstanding_amount;
END //

-- إجراء للحصول على ملخص مورد محدد
CREATE PROCEDURE GetSupplierSummary(IN supplier_name VARCHAR(255))
BEGIN
    SELECT 
        supplier_name as supplier,
        COALESCE(
            (SELECT SUM(totalAmount) FROM invoices WHERE supplier = supplier_name), 0
        ) as total_invoices,
        COALESCE(
            (SELECT SUM(amount) FROM payments WHERE supplier = supplier_name), 0
        ) as total_payments,
        COALESCE(
            (SELECT SUM(totalAmount) FROM invoices WHERE supplier = supplier_name), 0
        ) - COALESCE(
            (SELECT SUM(amount) FROM payments WHERE supplier = supplier_name), 0
        ) as outstanding_balance,
        (SELECT COUNT(*) FROM invoices WHERE supplier = supplier_name) as invoice_count,
        (SELECT COUNT(*) FROM payments WHERE supplier = supplier_name) as payment_count;
END //

-- إجراء للبحث في الفواتير
CREATE PROCEDURE SearchInvoices(IN search_term VARCHAR(255))
BEGIN
    SELECT * FROM invoices 
    WHERE invoiceNumber LIKE CONCAT('%', search_term, '%')
       OR supplier LIKE CONCAT('%', search_term, '%')
       OR type LIKE CONCAT('%', search_term, '%')
       OR category LIKE CONCAT('%', search_term, '%')
       OR notes LIKE CONCAT('%', search_term, '%')
    ORDER BY date DESC;
END //

DELIMITER ;

-- =================== مؤشرات الأداء ===================

-- تحسين البحث في الفواتير
CREATE FULLTEXT INDEX idx_invoice_search ON invoices(invoiceNumber, supplier, type, category, notes);

-- مؤشر مركب للبحث السريع
CREATE INDEX idx_supplier_date ON invoices(supplier, date);
CREATE INDEX idx_supplier_amount ON invoices(supplier, totalAmount);

-- =================== المشغلات (Triggers) ===================

-- مشغل لتحديث totalAmount تلقائياً
DELIMITER //
CREATE TRIGGER tr_invoice_calculate_total 
BEFORE INSERT ON invoices
FOR EACH ROW
BEGIN
    SET NEW.totalAmount = NEW.amountBeforeTax + NEW.taxAmount;
END //

CREATE TRIGGER tr_invoice_update_total 
BEFORE UPDATE ON invoices
FOR EACH ROW
BEGIN
    SET NEW.totalAmount = NEW.amountBeforeTax + NEW.taxAmount;
END //

DELIMITER ;

-- =================== صلاحيات المستخدمين ===================

-- إنشاء مستخدم للتطبيق (اختياري)
-- CREATE USER 'invoice_app'@'localhost' IDENTIFIED BY 'secure_password_here';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_system.* TO 'invoice_app'@'localhost';
-- FLUSH PRIVILEGES;

-- =================== النسخ الاحتياطي ===================

-- لإنشاء نسخة احتياطية، استخدم هذا الأمر في terminal:
-- mysqldump -u root -p invoice_system > backup_invoice_system.sql

-- =================== إحصائيات الأداء ===================

-- عرض إحصائيات الجداول
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS 'SIZE_MB'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'invoice_system';

-- عرض حالة المؤشرات
SHOW INDEX FROM invoices;
SHOW INDEX FROM purchase_orders;
SHOW INDEX FROM payments;
