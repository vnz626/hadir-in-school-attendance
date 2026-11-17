import { Module } from "@nestjs/common";
import { InfraModule } from "./infra/infra.module";
import { AccessPolicyModule } from "./modules/access-policy/access-policy.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ExportsModule } from "./modules/exports/exports.module";

/** Modul untuk proses worker: tanpa HTTP, hanya antrean job dan handler-nya. */
@Module({ imports: [InfraModule, AuditModule, AccessPolicyModule, ExportsModule] })
export class WorkerModule {}
