import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../shared/decorators/public.decorator";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: string; timestamp: string; uptime: number } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}