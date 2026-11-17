import { Module } from "@nestjs/common";
import { DevicesModule } from "../devices/devices.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Module({
  imports: [DevicesModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, PasswordService],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
