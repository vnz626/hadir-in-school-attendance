import { Module } from "@nestjs/common";
import { ExportsModule } from "../exports/exports.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

@Module({
  imports: [ExportsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
