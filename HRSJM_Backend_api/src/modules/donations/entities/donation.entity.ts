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

export enum DonationStatus {
  PENDING = "PENDING",
  RECEIVED = "RECEIVED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum DonationMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  MOBILE_WALLET = "MOBILE_WALLET",
  CARD = "CARD",
}

@Entity("donations")
@Index("IX_donations_status", ["status"])
@Index("IX_donations_donor_user_id", ["donorUserId"])
export class Donation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Linked donor when the donation came from a logged-in user; null = guest
  @Column({ type: "uuid", name: "donor_user_id", nullable: true })
  donorUserId!: string | null;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "donor_user_id" })
  donorUser!: User | null;

  // Guest donor info (required when donorUserId is null)
  @Column({ type: "varchar", length: 150, name: "donor_name" })
  donorName!: string;

  @Column({ type: "varchar", length: 255, name: "donor_email", nullable: true })
  donorEmail!: string | null;

  @Column({ type: "varchar", length: 20, name: "donor_mobile", nullable: true })
  donorMobile!: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "enum", enum: DonationMethod, name: "payment_method" })
  paymentMethod!: DonationMethod;

  @Column({ type: "varchar", length: 100, name: "transaction_id", nullable: true })
  transactionId!: string | null;

  @Column({ type: "date", name: "donation_date" })
  donationDate!: string;

  // Cause association (free text until a causes catalogue is confirmed)
  @Column({ type: "varchar", length: 150, nullable: true })
  cause!: string | null;

  @Column({ type: "enum", enum: DonationStatus, default: DonationStatus.PENDING })
  status!: DonationStatus;

  // Display-only reference to the senior accounting receipt (financials stay
  // senior-owned - this API never posts donation ledger entries itself)
  @Column({ type: "varchar", length: 30, name: "receipt_number", nullable: true })
  receiptNumber!: string | null;

  @Column({ type: "text", nullable: true })
  remarks!: string | null;

  @Column({ type: "uuid", name: "created_by", nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}