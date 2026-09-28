import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";

export enum ReceiptMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  MOBILE_WALLET = "MOBILE_WALLET",
  CARD = "CARD",
}

@Entity("income_receipts")
@Index("UQ_income_receipts_entry_number", ["entryNumber"], { unique: true })
@Index("IX_income_receipts_date", ["receiptDate"])
@Index("IX_income_receipts_income_account", ["incomeAccount"])
export class IncomeReceipt {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Auto-generated per-year sequence: RCV-2026-0001
  @Column({ type: "varchar", length: 30, name: "entry_number" })
  entryNumber!: string;

  @Column({ type: "date", name: "receipt_date" })
  receiptDate!: string;

  @Column({ type: "varchar", length: 150, name: "received_from" })
  receivedFrom!: string;

  @Column({ type: "varchar", length: 100, name: "income_account" })
  incomeAccount!: string;

  // Cash box / bank account the money landed in
  @Column({ type: "varchar", length: 100, name: "received_in_account" })
  receivedInAccount!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "enum", enum: ReceiptMethod })
  method!: ReceiptMethod;

  @Column({ type: "text", nullable: true })
  remarks!: string | null;

  // Optional document uploaded through the documents module and linked here
  @Column({ type: "uuid", name: "attachment_document_id", nullable: true })
  attachmentDocumentId!: string | null;

  @Column({ type: "uuid", name: "created_by" })
  createdBy!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "created_by" })
  createdByUser!: User;

  // Result of the senior accounting posting call (stub until integration)
  @Column({ type: "varchar", length: 64, name: "posting_ref", nullable: true })
  postingRef!: string | null;

  @Column({ type: "timestamptz", name: "posted_at", nullable: true })
  postedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}