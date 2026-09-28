import { Module } from "@nestjs/common";
import { AccountingBoundaryService } from "./accounting-boundary.service";

// Boundary towards the senior accounting system (ledger/report balances stay
// senior-owned). Exported so financial modules can post through it.
@Module({
  providers: [AccountingBoundaryService],
  exports: [AccountingBoundaryService],
})
export class AccountingModule {}