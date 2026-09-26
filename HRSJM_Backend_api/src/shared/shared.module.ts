import { Global, Module } from "@nestjs/common";
import { ApiConfigService } from "./helpers/api-config.service";

@Global()
@Module({
  providers: [ApiConfigService],
  exports: [ApiConfigService],
})
export class SharedModule {}
