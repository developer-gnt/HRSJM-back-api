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

export enum MembershipCategory {
  REGULAR = "REGULAR",
  STUDENT = "STUDENT",
  LIFETIME = "LIFETIME",
}

export enum MembershipStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  SUSPENDED = "SUSPENDED",
  CANCELLED = "CANCELLED",
}

@Entity("memberships")
@Index("UQ_memberships_membership_number", ["membershipNumber"], { unique: true })
@Index("IX_memberships_user_id", ["userId"])
@Index("IX_memberships_status", ["status"])
export class Membership {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Digital Membership ID - issued by the backend, derived from the
  // membership record itself (BRD: no duplicate member data)
  @Column({ type: "varchar", length: 30, name: "membership_number" })
  membershipNumber!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: MembershipCategory, default: MembershipCategory.REGULAR })
  category!: MembershipCategory;

  @Column({ type: "enum", enum: MembershipStatus, default: MembershipStatus.PENDING })
  status!: MembershipStatus;

  @Column({ type: "date", name: "joining_date" })
  joiningDate!: string;

  // null = lifetime membership (no expiry)
  @Column({ type: "date", name: "expiry_date", nullable: true })
  expiryDate!: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "fee_amount", default: "0.00" })
  feeAmount!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}