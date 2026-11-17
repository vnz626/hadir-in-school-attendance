import {
  Bandage,
  Check,
  CircleDashed,
  Clock,
  FileText,
  Flag,
  X,
  type LucideIcon,
} from "lucide-react";
import { ATTENDANCE_STATUS, type AttendanceStatus } from "@hadirin/shared";
import { statusColors } from "@hadirin/ui-tokens";
import type { MessageKey } from "./i18n";

/** Kunci tampilan status (huruf kecil), termasuk keadaan non-status. */
export type StatusKey = keyof typeof statusColors | "none" | "holiday";

export const STATUS_FROM_API: Record<AttendanceStatus, keyof typeof statusColors> = {
  [ATTENDANCE_STATUS.PRESENT]: "present",
  [ATTENDANCE_STATUS.LATE]: "late",
  [ATTENDANCE_STATUS.EXCUSED]: "excused",
  [ATTENDANCE_STATUS.SICK]: "sick",
  [ATTENDANCE_STATUS.DISPENSED]: "dispensed",
  [ATTENDANCE_STATUS.ABSENT]: "absent",
};

/** Bentuk ikon per status (Rancangan §4.8): status tidak boleh hanya dibedakan lewat warna. */
export const STATUS_ICON: Record<StatusKey, LucideIcon> = {
  present: Check,
  late: Clock,
  excused: FileText,
  sick: Bandage,
  dispensed: Flag,
  absent: X,
  none: CircleDashed,
  holiday: CircleDashed,
};

export const STATUS_LABEL_KEY: Record<StatusKey, MessageKey> = {
  present: "status.present",
  late: "status.late",
  excused: "status.excused",
  sick: "status.sick",
  dispensed: "status.dispensed",
  absent: "status.absent",
  none: "status.none",
  holiday: "status.holiday",
};

export const STATUS_CODE: Record<StatusKey, string> = {
  present: "H",
  late: "T",
  excused: "I",
  sick: "S",
  dispensed: "D",
  absent: "A",
  none: "-",
  holiday: "L",
};
