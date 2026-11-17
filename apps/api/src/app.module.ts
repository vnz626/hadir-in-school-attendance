import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard, RolesGuard } from "./common/auth.guard";
import { CsrfGuard } from "./common/csrf.guard";
import { HealthController } from "./health.controller";
import { InfraModule } from "./infra/infra.module";
import { AccessPolicyModule } from "./modules/access-policy/access-policy.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DevicesModule } from "./modules/devices/devices.module";
import { ExportsModule } from "./modules/exports/exports.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { MasterModule } from "./modules/master/master.module";
import { StudentsModule } from "./modules/students/students.module";

@Module({
  imports: [
    InfraModule,
    AuditModule,
    AccessPolicyModule,
    DevicesModule,
    AuthModule,
    StudentsModule,
    MasterModule,
    ExportsModule,
    ImportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Urutan penting: CSRF, lalu autentikasi, lalu peran.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
