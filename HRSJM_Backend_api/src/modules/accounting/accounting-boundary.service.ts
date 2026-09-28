import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";

/**
 * CRITICAL (BRD): all ledger and report balances are owned by the SENIOR
 * accounting system. This boundary only forwards posting requests to that
 * system - it must NEVER read or write ledger/report balances, totals or
 * balances itself. When the real senior accounting integration lands, only
 * the implementation of this service changes; callers stay the same.
 */
export interface AccountingPostingRequest {
  entryType: "INCOME_RECEIPT";
  referenceType: string;
  referenceId: string;
  entryNumber: string;
  receiptDate: string;
  amount: string;
  incomeAccount: string;
  receivedInAccount: string;
  method: string;
  receivedFrom: string;
  createdBy: string;
}

export interface AccountingPostingResult {
  accepted: boolean;
  postingRef: string;
  postedAt: string;
}

@Injectable()
export class AccountingBoundaryService {
  private readonly logger = new Logger("AccountingBoundary");

  async postIncomeReceipt(
    request: AccountingPostingRequest,
  ): Promise<AccountingPostingResult> {
    // Stub: the senior accounting system is not integrated yet. We log the
    // posting attempt and hand back a reference the receipt can display.
    this.logger.log(
      `Posting to senior accounting (stub): ${request.entryNumber} ` +
        `${request.amount} to ${request.incomeAccount} (ref ${request.referenceId})`,
    );
    return {
      accepted: true,
      postingRef: `ACC-${randomUUID()}`,
      postedAt: new Date().toISOString(),
    };
  }
}