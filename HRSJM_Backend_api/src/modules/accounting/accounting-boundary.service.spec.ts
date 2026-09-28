import { AccountingBoundaryService } from "./accounting-boundary.service";

describe("AccountingBoundaryService (stub)", () => {
  it("accepts postings and returns a reference", async () => {
    const service = new AccountingBoundaryService();
    const result = await service.postIncomeReceipt({
      entryType: "INCOME_RECEIPT",
      referenceType: "RECEIPT_ENTRY",
      referenceId: "r-1",
      entryNumber: "RCV-2026-0001",
      receiptDate: "2026-09-28",
      amount: "5000.00",
      incomeAccount: "Membership Fees",
      receivedInAccount: "Cash Box",
      method: "CASH",
      receivedFrom: "Abdul Karim",
      createdBy: "u-admin",
    });
    expect(result.accepted).toBe(true);
    expect(result.postingRef).toMatch(/^ACC-[0-9a-f-]{36}$/);
    expect(result.postedAt).toBeDefined();
  });

  it("returns a distinct reference per posting", async () => {
    const service = new AccountingBoundaryService();
    const base = {
      entryType: "INCOME_RECEIPT" as const,
      referenceType: "RECEIPT_ENTRY",
      referenceId: "r-1",
      entryNumber: "RCV-2026-0001",
      receiptDate: "2026-09-28",
      amount: "5000.00",
      incomeAccount: "Membership Fees",
      receivedInAccount: "Cash Box",
      method: "CASH",
      receivedFrom: "Abdul Karim",
      createdBy: "u-admin",
    };
    const a = await service.postIncomeReceipt(base);
    const b = await service.postIncomeReceipt(base);
    expect(a.postingRef).not.toBe(b.postingRef);
  });
});