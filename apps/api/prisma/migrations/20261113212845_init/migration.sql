-- CreateTable
CREATE TABLE `schools` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `npsn` VARCHAR(20) NULL,
    `address` VARCHAR(500) NULL,
    `timezone` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `schools_npsn_key`(`npsn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `school_settings` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `checkin_modes` JSON NOT NULL,
    `attendance_mode` ENUM('DAILY_ONLY', 'SUBJECT_ONLY', 'BOTH') NOT NULL DEFAULT 'DAILY_ONLY',
    `school_days` JSON NOT NULL,
    `daily_start_time` SMALLINT NOT NULL DEFAULT 420,
    `daily_close_time` SMALLINT NOT NULL DEFAULT 540,
    `default_late_after_minutes` INTEGER NOT NULL DEFAULT 10,
    `late_after_open_grace_minutes` INTEGER NOT NULL DEFAULT 5,
    `adhoc_session_minutes` INTEGER NOT NULL DEFAULT 60,
    `geofence_enabled` BOOLEAN NOT NULL DEFAULT false,
    `location_accuracy_max_m` INTEGER NOT NULL DEFAULT 100,
    `device_binding_enabled` BOOLEAN NOT NULL DEFAULT false,
    `device_self_rebind_days` INTEGER NOT NULL DEFAULT 60,
    `percentage_rule` ENUM('EXCLUDE_EXCUSED', 'INCLUDE_EXCUSED') NOT NULL DEFAULT 'EXCLUDE_EXCUSED',
    `notify_quiet_start` SMALLINT NOT NULL DEFAULT 360,
    `notify_quiet_end` SMALLINT NOT NULL DEFAULT 1200,
    `subject_digest_time` SMALLINT NOT NULL DEFAULT 900,
    `backfill_days` INTEGER NOT NULL DEFAULT 7,
    `retention_years` INTEGER NOT NULL DEFAULT 3,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `school_settings_school_id_key`(`school_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `role` ENUM('ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(190) NULL,
    `login_id` VARCHAR(50) NULL,
    `phone` VARCHAR(32) NULL,
    `password_hash` VARCHAR(255) NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_school_id_login_id_key`(`school_id`, `login_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `geofences` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `radius_m` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `geofences_school_id_idx`(`school_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_years` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(20) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academic_years_school_id_name_key`(`school_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `terms` (
    `id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `semester` SMALLINT NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `terms_academic_year_id_semester_key`(`academic_year_id`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teachers` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `nip` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teachers_user_id_key`(`user_id`),
    UNIQUE INDEX `teachers_nip_key`(`nip`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_positions` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `position` ENUM('PICKET', 'COUNSELOR', 'PRINCIPAL') NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `staff_positions_teacher_id_position_idx`(`teacher_id`, `position`),
    INDEX `staff_positions_academic_year_id_idx`(`academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subjects` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subjects_school_id_code_key`(`school_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `classes` (
    `id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `grade` INTEGER NOT NULL,
    `homeroom_teacher_id` CHAR(36) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `classes_homeroom_teacher_id_idx`(`homeroom_teacher_id`),
    UNIQUE INDEX `classes_academic_year_id_name_key`(`academic_year_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `nis` VARCHAR(30) NOT NULL,
    `nisn` VARCHAR(20) NULL,
    `status` ENUM('ACTIVE', 'GRADUATED', 'MOVED', 'DROPPED') NOT NULL DEFAULT 'ACTIVE',
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `students_user_id_key`(`user_id`),
    UNIQUE INDEX `students_nis_key`(`nis`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `class_enrollments` (
    `id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `academic_year_id` CHAR(36) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NULL,
    `end_reason` ENUM('PROMOTED', 'MOVED_CLASS', 'MOVED_SCHOOL', 'GRADUATED', 'DROPPED') NULL,
    `open_enrollment_key` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `class_enrollments_open_enrollment_key_key`(`open_enrollment_key`),
    INDEX `class_enrollments_class_id_start_date_end_date_idx`(`class_id`, `start_date`, `end_date`),
    INDEX `class_enrollments_student_id_start_date_idx`(`student_id`, `start_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parents` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `phone_wa` VARCHAR(20) NOT NULL,
    `wa_opt_in` BOOLEAN NOT NULL DEFAULT false,
    `wa_opt_in_at` DATETIME(3) NULL,
    `wa_opt_out_at` DATETIME(3) NULL,
    `wa_opt_source` ENUM('PORTAL', 'REPLY', 'ADMIN') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `parents_user_id_key`(`user_id`),
    UNIQUE INDEX `parents_phone_wa_key`(`phone_wa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_parents` (
    `id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NOT NULL,
    `relation` VARCHAR(30) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `receives_notifications` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `student_parents_parent_id_idx`(`parent_id`),
    UNIQUE INDEX `student_parents_student_id_parent_id_key`(`student_id`, `parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedules` (
    `id` CHAR(36) NOT NULL,
    `term_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `subject_id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `day_of_week` SMALLINT NOT NULL,
    `start_time` SMALLINT NOT NULL,
    `end_time` SMALLINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `schedules_term_id_class_id_day_of_week_idx`(`term_id`, `class_id`, `day_of_week`),
    INDEX `schedules_teacher_id_day_of_week_idx`(`teacher_id`, `day_of_week`),
    INDEX `schedules_subject_id_idx`(`subject_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_substitutions` (
    `id` CHAR(36) NOT NULL,
    `schedule_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `substitute_teacher_id` CHAR(36) NOT NULL,
    `assigned_by_id` CHAR(36) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `schedule_substitutions_substitute_teacher_id_date_idx`(`substitute_teacher_id`, `date`),
    INDEX `schedule_substitutions_assigned_by_id_idx`(`assigned_by_id`),
    UNIQUE INDEX `schedule_substitutions_schedule_id_date_key`(`schedule_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `date_from` DATE NOT NULL,
    `date_to` DATE NOT NULL,
    `scope` ENUM('ALL', 'GRADE', 'CLASS') NOT NULL,
    `grade` INTEGER NULL,
    `class_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `holidays_school_id_date_from_date_to_idx`(`school_id`, `date_from`, `date_to`),
    INDEX `holidays_class_id_idx`(`class_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_sessions` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `term_id` CHAR(36) NOT NULL,
    `schedule_id` CHAR(36) NULL,
    `subject_id` CHAR(36) NULL,
    `type` ENUM('DAILY', 'SUBJECT') NOT NULL,
    `session_date` DATE NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `late_after_minutes` INTEGER NOT NULL,
    `late_threshold_at` DATETIME(3) NOT NULL,
    `opened_at` DATETIME(3) NOT NULL,
    `opened_by_id` CHAR(36) NOT NULL,
    `closes_at` DATETIME(3) NOT NULL,
    `closed_at` DATETIME(3) NULL,
    `closed_by_id` CHAR(36) NULL,
    `status` ENUM('OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `cancel_reason` VARCHAR(255) NULL,
    `qr_secret_enc` VARCHAR(255) NOT NULL,
    `is_backfill` BOOLEAN NOT NULL DEFAULT false,
    `schedule_slot_key` VARCHAR(80) NULL,
    `daily_slot_key` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `attendance_sessions_schedule_slot_key_key`(`schedule_slot_key`),
    UNIQUE INDEX `attendance_sessions_daily_slot_key_key`(`daily_slot_key`),
    INDEX `attendance_sessions_class_id_session_date_status_idx`(`class_id`, `session_date`, `status`),
    INDEX `attendance_sessions_status_closes_at_idx`(`status`, `closes_at`),
    INDEX `attendance_sessions_schedule_id_idx`(`schedule_id`),
    INDEX `attendance_sessions_term_id_idx`(`term_id`),
    INDEX `attendance_sessions_subject_id_idx`(`subject_id`),
    INDEX `attendance_sessions_school_id_session_date_idx`(`school_id`, `session_date`),
    INDEX `attendance_sessions_opened_by_id_idx`(`opened_by_id`),
    INDEX `attendance_sessions_closed_by_id_idx`(`closed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendances` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `session_date` DATE NOT NULL,
    `session_type` ENUM('DAILY', 'SUBJECT') NOT NULL,
    `status` ENUM('PRESENT', 'LATE', 'EXCUSED', 'SICK', 'DISPENSED', 'ABSENT') NOT NULL,
    `method` ENUM('QR', 'CODE', 'MANUAL', 'LEAVE', 'AUTO') NOT NULL,
    `checked_in_at` DATETIME(3) NULL,
    `late_minutes` INTEGER NOT NULL DEFAULT 0,
    `distance_m` INTEGER NULL,
    `accuracy_m` INTEGER NULL,
    `geofence_id` CHAR(36) NULL,
    `device_id` CHAR(36) NULL,
    `leave_request_id` CHAR(36) NULL,
    `note` VARCHAR(500) NULL,
    `created_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendances_student_id_session_date_idx`(`student_id`, `session_date`),
    INDEX `attendances_class_id_session_date_idx`(`class_id`, `session_date`),
    INDEX `attendances_geofence_id_idx`(`geofence_id`),
    INDEX `attendances_device_id_idx`(`device_id`),
    INDEX `attendances_leave_request_id_idx`(`leave_request_id`),
    INDEX `attendances_created_by_id_idx`(`created_by_id`),
    UNIQUE INDEX `attendances_session_id_student_id_key`(`session_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance_audits` (
    `id` CHAR(36) NOT NULL,
    `attendance_id` CHAR(36) NOT NULL,
    `actor_type` ENUM('USER', 'SYSTEM') NOT NULL,
    `changed_by_id` CHAR(36) NULL,
    `old_status` ENUM('PRESENT', 'LATE', 'EXCUSED', 'SICK', 'DISPENSED', 'ABSENT') NULL,
    `new_status` ENUM('PRESENT', 'LATE', 'EXCUSED', 'SICK', 'DISPENSED', 'ABSENT') NOT NULL,
    `old_method` ENUM('QR', 'CODE', 'MANUAL', 'LEAVE', 'AUTO') NULL,
    `new_method` ENUM('QR', 'CODE', 'MANUAL', 'LEAVE', 'AUTO') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `source` ENUM('CORRECTION', 'LEAVE_APPROVAL', 'LEAVE_REVOKED') NOT NULL,
    `leave_request_id` CHAR(36) NULL,
    `changed_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `attendance_audits_attendance_id_changed_at_idx`(`attendance_id`, `changed_at`),
    INDEX `attendance_audits_changed_by_id_idx`(`changed_by_id`),
    INDEX `attendance_audits_leave_request_id_idx`(`leave_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_statuses` (
    `id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `class_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('PRESENT', 'LATE', 'EXCUSED', 'SICK', 'DISPENSED', 'ABSENT') NOT NULL,
    `source` ENUM('DAILY_SESSION', 'DERIVED') NOT NULL,
    `partial_absence` BOOLEAN NOT NULL DEFAULT false,
    `computed_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_statuses_class_id_date_idx`(`class_id`, `date`),
    UNIQUE INDEX `daily_statuses_student_id_date_key`(`student_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `devices` (
    `id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `device_hash` VARCHAR(128) NOT NULL,
    `platform` VARCHAR(32) NULL,
    `label` VARCHAR(100) NULL,
    `status` ENUM('ACTIVE', 'PENDING', 'REVOKED') NOT NULL,
    `bind_method` ENUM('FIRST_LOGIN', 'SELF_REBIND', 'APPROVED') NOT NULL,
    `bound_at` DATETIME(3) NOT NULL,
    `approved_by_id` CHAR(36) NULL,
    `revoked_at` DATETIME(3) NULL,
    `revoke_reason` VARCHAR(255) NULL,
    `shared_approved` BOOLEAN NOT NULL DEFAULT false,
    `active_student_key` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `devices_active_student_key_key`(`active_student_key`),
    INDEX `devices_student_id_status_idx`(`student_id`, `status`),
    INDEX `devices_device_hash_idx`(`device_hash`),
    INDEX `devices_approved_by_id_idx`(`approved_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_requests` (
    `id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `requested_by_id` CHAR(36) NOT NULL,
    `requester_role` ENUM('ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
    `type` ENUM('EXCUSED', 'SICK', 'DISPENSED') NOT NULL,
    `date_from` DATE NOT NULL,
    `date_to` DATE NOT NULL,
    `time_from` SMALLINT NULL,
    `time_to` SMALLINT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reviewed_by_id` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reject_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leave_requests_student_id_date_from_date_to_idx`(`student_id`, `date_from`, `date_to`),
    INDEX `leave_requests_status_created_at_idx`(`status`, `created_at`),
    INDEX `leave_requests_requested_by_id_idx`(`requested_by_id`),
    INDEX `leave_requests_reviewed_by_id_idx`(`reviewed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_attachments` (
    `id` CHAR(36) NOT NULL,
    `leave_request_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leave_attachments_leave_request_id_idx`(`leave_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_templates` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `key` ENUM('ABSENT', 'LATE', 'DAILY_DIGEST', 'CORRECTION', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'OTP', 'MAGIC_LINK') NOT NULL,
    `channel` ENUM('WHATSAPP', 'INAPP', 'EMAIL') NOT NULL,
    `body` TEXT NOT NULL,
    `provider_template_name` VARCHAR(100) NULL,
    `is_editable` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_templates_school_id_key_channel_key`(`school_id`, `key`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NULL,
    `parent_id` CHAR(36) NULL,
    `attendance_id` CHAR(36) NULL,
    `leave_request_id` CHAR(36) NULL,
    `channel` ENUM('WHATSAPP', 'INAPP', 'EMAIL') NOT NULL,
    `template_key` ENUM('ABSENT', 'LATE', 'DAILY_DIGEST', 'CORRECTION', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'OTP', 'MAGIC_LINK') NOT NULL,
    `dedupe_key` VARCHAR(190) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `skip_reason` VARCHAR(100) NULL,
    `provider_message_id` VARCHAR(128) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notifications_dedupe_key_key`(`dedupe_key`),
    INDEX `notifications_status_scheduled_at_idx`(`status`, `scheduled_at`),
    INDEX `notifications_school_id_idx`(`school_id`),
    INDEX `notifications_student_id_idx`(`student_id`),
    INDEX `notifications_parent_id_idx`(`parent_id`),
    INDEX `notifications_attendance_id_idx`(`attendance_id`),
    INDEX `notifications_leave_request_id_idx`(`leave_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by` CHAR(36) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_id_idx`(`family_id`),
    INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `purpose` ENUM('MAGIC_LINK', 'OTP', 'PASSWORD_RESET') NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `login_tokens_token_hash_key`(`token_hash`),
    INDEX `login_tokens_user_id_purpose_idx`(`user_id`, `purpose`),
    INDEX `login_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `imports` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `kind` ENUM('STUDENTS', 'TEACHERS', 'PARENTS', 'SCHEDULES') NOT NULL,
    `status` ENUM('PREVIEW', 'COMMITTED', 'FAILED') NOT NULL DEFAULT 'PREVIEW',
    `file_key` VARCHAR(255) NOT NULL,
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `valid_rows` INTEGER NOT NULL DEFAULT 0,
    `error_rows` INTEGER NOT NULL DEFAULT 0,
    `report` JSON NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `committed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `imports_school_id_created_at_idx`(`school_id`, `created_at`),
    INDEX `imports_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `school_id` CHAR(36) NOT NULL,
    `actor_id` CHAR(36) NULL,
    `action` VARCHAR(64) NOT NULL,
    `entity` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `meta` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_school_id_created_at_idx`(`school_id`, `created_at`),
    INDEX `audit_logs_actor_id_idx`(`actor_id`),
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jobs` (
    `id` CHAR(36) NOT NULL,
    `queue` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `dedupe_key` VARCHAR(190) NULL,
    `status` ENUM('PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `run_at` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `max_attempts` INTEGER NOT NULL DEFAULT 5,
    `locked_by` VARCHAR(64) NULL,
    `locked_until` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `jobs_dedupe_key_key`(`dedupe_key`),
    INDEX `jobs_status_run_at_idx`(`status`, `run_at`),
    INDEX `jobs_queue_status_run_at_idx`(`queue`, `status`, `run_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_keys` (
    `id` CHAR(36) NOT NULL,
    `scope` VARCHAR(64) NOT NULL,
    `key` VARCHAR(128) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `response_status` INTEGER NULL,
    `response_body` JSON NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idempotency_keys_expires_at_idx`(`expires_at`),
    UNIQUE INDEX `idempotency_keys_scope_key_key`(`scope`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `school_settings` ADD CONSTRAINT `school_settings_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `geofences` ADD CONSTRAINT `geofences_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `academic_years` ADD CONSTRAINT `academic_years_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `terms` ADD CONSTRAINT `terms_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_positions` ADD CONSTRAINT `staff_positions_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `staff_positions` ADD CONSTRAINT `staff_positions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `subjects` ADD CONSTRAINT `subjects_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `classes` ADD CONSTRAINT `classes_homeroom_teacher_id_fkey` FOREIGN KEY (`homeroom_teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_enrollments` ADD CONSTRAINT `class_enrollments_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_enrollments` ADD CONSTRAINT `class_enrollments_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `class_enrollments` ADD CONSTRAINT `class_enrollments_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `parents` ADD CONSTRAINT `parents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `student_parents` ADD CONSTRAINT `student_parents_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `student_parents` ADD CONSTRAINT `student_parents_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_substitutions` ADD CONSTRAINT `schedule_substitutions_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_substitutions` ADD CONSTRAINT `schedule_substitutions_substitute_teacher_id_fkey` FOREIGN KEY (`substitute_teacher_id`) REFERENCES `teachers`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_substitutions` ADD CONSTRAINT `schedule_substitutions_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_subject_id_fkey` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_opened_by_id_fkey` FOREIGN KEY (`opened_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_closed_by_id_fkey` FOREIGN KEY (`closed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_geofence_id_fkey` FOREIGN KEY (`geofence_id`) REFERENCES `geofences`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendances` ADD CONSTRAINT `attendances_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_audits` ADD CONSTRAINT `attendance_audits_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_audits` ADD CONSTRAINT `attendance_audits_changed_by_id_fkey` FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `attendance_audits` ADD CONSTRAINT `attendance_audits_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `daily_statuses` ADD CONSTRAINT `daily_statuses_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `daily_statuses` ADD CONSTRAINT `daily_statuses_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `devices` ADD CONSTRAINT `devices_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `leave_requests` ADD CONSTRAINT `leave_requests_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `leave_attachments` ADD CONSTRAINT `leave_attachments_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notification_templates` ADD CONSTRAINT `notification_templates_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `attendances`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `login_tokens` ADD CONSTRAINT `login_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `imports` ADD CONSTRAINT `imports_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `imports` ADD CONSTRAINT `imports_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_school_id_fkey` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ======================================================================
-- CHECK dan kolom kunci (Rancangan §10.3). Ditambahkan manual; Prisma tidak membacanya.
-- Semua ekspresi dijaga agar tidak pernah bernilai NULL (CHECK yang NULL dianggap lolos).
-- ======================================================================

-- Kolom kunci: nilai terisi hanya saat aturan berlaku, NULL selain itu, dan selalu konsisten.
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `chk_sessions_schedule_slot_key` CHECK (
  (`schedule_id` IS NOT NULL AND `status` <> 'CANCELLED' AND `schedule_slot_key` <=> CONCAT(`schedule_id`, '|', `session_date`))
  OR (NOT (`schedule_id` IS NOT NULL AND `status` <> 'CANCELLED') AND `schedule_slot_key` IS NULL)
);

ALTER TABLE `attendance_sessions` ADD CONSTRAINT `chk_sessions_daily_slot_key` CHECK (
  (`type` = 'DAILY' AND `status` <> 'CANCELLED' AND `daily_slot_key` <=> CONCAT(`class_id`, '|', `session_date`))
  OR (NOT (`type` = 'DAILY' AND `status` <> 'CANCELLED') AND `daily_slot_key` IS NULL)
);

ALTER TABLE `devices` ADD CONSTRAINT `chk_devices_active_student_key` CHECK (
  (`status` = 'ACTIVE' AND `active_student_key` <=> `student_id`)
  OR (`status` <> 'ACTIVE' AND `active_student_key` IS NULL)
);

ALTER TABLE `class_enrollments` ADD CONSTRAINT `chk_enrollments_open_key` CHECK (
  (`end_date` IS NULL AND `open_enrollment_key` <=> CONCAT(`student_id`, '|', `academic_year_id`))
  OR (`end_date` IS NOT NULL AND `open_enrollment_key` IS NULL)
);

-- Sesi
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `chk_sessions_late_after` CHECK (`late_after_minutes` >= 0);
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `chk_sessions_closes_after_opened` CHECK (`closes_at` > `opened_at`);
-- Kehadiran
ALTER TABLE `attendances` ADD CONSTRAINT `chk_attendances_checked_in` CHECK (
  `status` NOT IN ('PRESENT', 'LATE') OR `checked_in_at` IS NOT NULL
);
ALTER TABLE `attendances` ADD CONSTRAINT `chk_attendances_late_minutes` CHECK (
  (`status` = 'LATE') = (`late_minutes` > 0) AND `late_minutes` >= 0
);
ALTER TABLE `attendances` ADD CONSTRAINT `chk_attendances_distance` CHECK (
  (`distance_m` IS NULL OR `distance_m` >= 0) AND (`accuracy_m` IS NULL OR `accuracy_m` >= 0)
);

-- Pendaftaran kelas
ALTER TABLE `class_enrollments` ADD CONSTRAINT `chk_enrollments_dates` CHECK (
  `end_date` IS NULL OR `end_date` >= `start_date`
);

-- Geofence
ALTER TABLE `geofences` ADD CONSTRAINT `chk_geofences_lat` CHECK (`lat` BETWEEN -90 AND 90);
ALTER TABLE `geofences` ADD CONSTRAINT `chk_geofences_lng` CHECK (`lng` BETWEEN -180 AND 180);
ALTER TABLE `geofences` ADD CONSTRAINT `chk_geofences_radius` CHECK (`radius_m` > 0);

-- Pengaturan sekolah: jam dinding 0..1439
ALTER TABLE `school_settings` ADD CONSTRAINT `chk_settings_minutes` CHECK (
  `daily_start_time` BETWEEN 0 AND 1439 AND `daily_close_time` BETWEEN 0 AND 1439
  AND `notify_quiet_start` BETWEEN 0 AND 1439 AND `notify_quiet_end` BETWEEN 0 AND 1439
  AND `subject_digest_time` BETWEEN 0 AND 1439
);
ALTER TABLE `school_settings` ADD CONSTRAINT `chk_settings_ranges` CHECK (
  `default_late_after_minutes` >= 0 AND `late_after_open_grace_minutes` >= 0
  AND `adhoc_session_minutes` BETWEEN 1 AND 240 AND `location_accuracy_max_m` > 0
  AND `device_self_rebind_days` >= 0 AND `backfill_days` >= 0 AND `retention_years` >= 0
);

-- Jadwal
ALTER TABLE `schedules` ADD CONSTRAINT `chk_schedules_day` CHECK (`day_of_week` BETWEEN 1 AND 7);
ALTER TABLE `schedules` ADD CONSTRAINT `chk_schedules_time` CHECK (
  `start_time` BETWEEN 0 AND 1439 AND `end_time` BETWEEN 0 AND 1439 AND `end_time` > `start_time`
);

-- Kalender akademik
ALTER TABLE `academic_years` ADD CONSTRAINT `chk_years_dates` CHECK (`end_date` >= `start_date`);
ALTER TABLE `terms` ADD CONSTRAINT `chk_terms_semester` CHECK (`semester` IN (1, 2));
ALTER TABLE `terms` ADD CONSTRAINT `chk_terms_dates` CHECK (`end_date` >= `start_date`);
ALTER TABLE `staff_positions` ADD CONSTRAINT `chk_positions_dates` CHECK (
  `ends_on` IS NULL OR `ends_on` >= `starts_on`
);

-- Libur: scope menentukan kolom yang terisi
ALTER TABLE `holidays` ADD CONSTRAINT `chk_holidays_dates` CHECK (`date_to` >= `date_from`);
ALTER TABLE `holidays` ADD CONSTRAINT `chk_holidays_scope_class` CHECK ((`scope` = 'CLASS') = (`class_id` IS NOT NULL));
ALTER TABLE `holidays` ADD CONSTRAINT `chk_holidays_scope_grade` CHECK ((`scope` = 'GRADE') = (`grade` IS NOT NULL));

-- Pengajuan izin
ALTER TABLE `leave_requests` ADD CONSTRAINT `chk_leave_dates` CHECK (`date_to` >= `date_from`);
ALTER TABLE `leave_requests` ADD CONSTRAINT `chk_leave_times` CHECK (
  (`time_from` IS NULL OR `time_from` BETWEEN 0 AND 1439)
  AND (`time_to` IS NULL OR `time_to` BETWEEN 0 AND 1439)
  AND (`time_from` IS NULL OR `time_to` IS NULL OR `time_to` > `time_from`)
);
ALTER TABLE `leave_attachments` ADD CONSTRAINT `chk_leave_attachments_size` CHECK (`size_bytes` > 0);

-- Infrastruktur
ALTER TABLE `jobs` ADD CONSTRAINT `chk_jobs_attempts` CHECK (`attempts` >= 0 AND `max_attempts` >= 1);
ALTER TABLE `notifications` ADD CONSTRAINT `chk_notifications_attempts` CHECK (`attempts` >= 0);
