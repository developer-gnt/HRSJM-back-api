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
import { Membership } from "../../memberships/entities/membership.entity";

export enum RenewalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  ACTIVE = "ACTIVE",
}

export enum RenewalPaymentStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum RenewalPaymentMethod {
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  MOBILE_WALLET = "MOBILE_WALLET",
  CARD = "CARD",
}

@Entity("membership_renewals")
@Index("IX_membership_renewals_membership_id", ["membershipId"])
@Index("IX_membership_renewals_status", ["status"])
export class RenewalRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "membership_id" })
  membershipId!: string;

  @ManyToOne(() => Membership, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "membership_id" })
  membership!: Membership;

  // Who submitted the renewal (member themselves, or admin on their behalf)
  @Column({ type: "uuid", name: "requested_by" })
  requestedBy!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "requested_by" })
  requestedByUser!: User;

  @Column({ name: "period_years" })
  periodYears!: number;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: "enum", enum: RenewalPaymentMethod, name: "payment_method" })
  paymentMethod!: RenewalPaymentMethod;

  @Column({ type: "varchar", length: 100, name: "transaction_id", nullable: true })
  transactionId!: string | null;

  @Column({ type: "enum", enum: RenewalPaymentStatus, default: RenewalPaymentStatus.PENDING })
  paymentStatus!: RenewalPaymentStatus;

  @Column({ type: "enum", enum: RenewalStatus, default: RenewalStatus.PENDING })
  status!: RenewalStatus;

  @Column({ type: "varchar", length: 30, name: "receipt_number", nullable: true })
  receiptNumber!: string | null;

  @Column({ type: "date", name: "previous_expiry", nullable: true })
  previousExpiry!: string | null;

  @Column({ type: "date", name: "new_expiry", nullable: true })
  newExpiry!: string | null;

  @Column({ type: "text", name: "admin_remark", nullable: true })
  adminRemark!: string | null;

  @Column({ type: "text", name: "member_note", nullable: true })
  memberNote!: string | null;

  @Column({ type: "uuid", name: "reviewed_by", nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "reviewed_by" })
  reviewedByUser!: User | null;

  @Column({ type: "timestamptz", name: "reviewed_at", nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}