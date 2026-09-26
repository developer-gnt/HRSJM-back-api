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

export enum AssistanceRequestStatus {
  PENDING = "PENDING",
  UNDER_REVIEW = "UNDER_REVIEW",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CLOSED = "CLOSED",
}

@Entity("assistance_requests")
@Index("IX_assistance_requests_user_id", ["userId"])
@Index("IX_assistance_requests_status", ["status"])
export class AssistanceRequest {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 150, name: "full_name" })
  fullName!: string;

  @Column({ type: "varchar", length: 20 })
  mobile!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  @Column({ type: "numeric", precision: 12, scale: 2, name: "requested_amount" })
  requestedAmount!: string;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: AssistanceRequestStatus, default: AssistanceRequestStatus.PENDING })
  status!: AssistanceRequestStatus;

  @Column({ type: "text", name: "admin_remark", nullable: true })
  adminRemark!: string | null;

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