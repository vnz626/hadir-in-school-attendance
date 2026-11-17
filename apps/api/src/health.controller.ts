import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/auth.decorators";

// Pemantauan liveness: tanpa autentikasi dan tanpa data apa pun.
@Public()
@Controller()
export class HealthController {
  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }
}
