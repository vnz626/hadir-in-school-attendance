-- Trigger integritas jejak (Rancangan §10.3). Idempoten: DROP lalu CREATE.
-- Dijalankan pernyataan demi pernyataan oleh `pnpm db:migrate`; pernyataan dipisah baris `-- @@`
-- supaya tidak butuh DELIMITER milik klien mysql.
-- Tujuan: tidak ada jalur (aplikasi, skrip, phpMyAdmin) yang bisa menghapus kehadiran
-- atau mengubah/menghapus jejak audit.

DROP TRIGGER IF EXISTS `trg_attendances_no_delete`
-- @@
CREATE TRIGGER `trg_attendances_no_delete` BEFORE DELETE ON `attendances`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendances tidak boleh dihapus';
END
-- @@
DROP TRIGGER IF EXISTS `trg_attendance_audits_no_update`
-- @@
CREATE TRIGGER `trg_attendance_audits_no_update` BEFORE UPDATE ON `attendance_audits`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_audits hanya boleh ditambah';
END
-- @@
DROP TRIGGER IF EXISTS `trg_attendance_audits_no_delete`
-- @@
CREATE TRIGGER `trg_attendance_audits_no_delete` BEFORE DELETE ON `attendance_audits`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'attendance_audits hanya boleh ditambah';
END
-- @@
DROP TRIGGER IF EXISTS `trg_audit_logs_no_update`
-- @@
CREATE TRIGGER `trg_audit_logs_no_update` BEFORE UPDATE ON `audit_logs`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs hanya boleh ditambah';
END
-- @@
DROP TRIGGER IF EXISTS `trg_audit_logs_no_delete`
-- @@
CREATE TRIGGER `trg_audit_logs_no_delete` BEFORE DELETE ON `audit_logs`
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs hanya boleh ditambah';
END
