-- إنشاء قاعدة البيانات
CREATE DATABASE IF NOT EXISTS erp_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE erp_system;

-- جدول الموردين
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- جدول الفواتير
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(50) PRIMARY KEY,
  invoice_number VARCHAR(100) NOT NULL,
  supplier_id INT NOT NULL,
  type VARCHAR(100),
  category VARCHAR(100),
  date DATE,
  amount_before_tax DECIMAL(10,2),
  tax_amount DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  notes TEXT,
  file_data LONGTEXT,
  file_type VARCHAR(50),
  file_name VARCHAR(255),
  file_size INT,
  purchase_order_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  INDEX idx_supplier (supplier_id),
  INDEX idx_date (date),
  INDEX idx_purchase_order (purchase_order_id)
);

-- جدول المدفوعات
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(50) PRIMARY KEY,
  supplier_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  INDEX idx_supplier (supplier_id),
  INDEX idx_date (date)
);

-- جدول أوامر الشراء
CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(50) PRIMARY KEY,
  supplier_id INT NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  pdf_file_data LONGTEXT,
  pdf_file_name VARCHAR(255),
  pdf_file_size INT,
  status VARCHAR(50) DEFAULT 'active',
  created_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  INDEX idx_supplier (supplier_id),
  INDEX idx_status (status)
);

-- إدراج بيانات تجريبية
INSERT INTO suppliers (name) VALUES 
('شركة المكتب الحديث'),
('مؤسسة التقنية المتطورة'),
('معرض الأثاث المميز'),
('مركز الصيانة الشامل'),
('شركة الخليج للتجارة');

-- إدراج فواتير تجريبية
INSERT INTO invoices (id, invoice_number, supplier_id, type, category, date, amount_before_tax, tax_amount, total_amount, notes) VALUES
('inv001', 'INV-2024-001', 1, 'فاتورة شراء', 'مكتبية', '2024-01-15', 1000, 150, 1150, 'أدوات مكتبية متنوعة للمكتب الرئيسي'),
('inv002', 'INV-2024-002', 2, 'فاتورة خدمة', 'تقنية', '2024-01-18', 2500, 375, 2875, 'صيانة أجهزة الكمبيوتر والشبكات'),
('inv003', 'INV-2024-003', 3, 'فاتورة شراء', 'أثاث', '2024-01-20', 5000, 750, 5750, 'كراسي وطاولات مكتبية جديدة');

-- إدراج مدفوعات تجريبية
INSERT INTO payments (id, supplier_id, amount, date, notes) VALUES
('pay001', 1, 1000, '2024-01-20', 'دفعة أولى من فواتير يناير'),
('pay002', 2, 2000, '2024-01-25', 'دفعة جزئية لخدمات الصيانة');

-- إدراج أوامر شراء تجريبية
INSERT INTO purchase_orders (id, supplier_id, description, price, created_date) VALUES
('PO-001', 5, 'أجهزة كمبيوتر ومعدات مكتبية للفرع الجديد', 45000, '2025-01-15'),
('PO-002', 2, 'خدمات صيانة وتطوير البرمجيات', 22000, '2025-01-20');
