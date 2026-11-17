import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JOB_HANDLERS, JobRunner } from "../jobs/job-runner";
import {
  CARD_RENDERER,
  CredentialCardsHandler,
  renderCredentialCardsPdf,
} from "./credential-cards";
import { ExportsController, ExportsService } from "./exports.controller";
import { FileUrlService } from "./file-url.service";

@Module({
  imports: [AuthModule],
  controllers: [ExportsController],
  providers: [
    ExportsService,
    FileUrlService,
    CredentialCardsHandler,
    { provide: CARD_RENDERER, useValue: renderCredentialCardsPdf },
    {
      provide: JOB_HANDLERS,
      useFactory: (cards: CredentialCardsHandler) => [cards],
      inject: [CredentialCardsHandler],
    },
    JobRunner,
  ],
  exports: [ExportsService, FileUrlService, JobRunner],
})
export class ExportsModule {}
