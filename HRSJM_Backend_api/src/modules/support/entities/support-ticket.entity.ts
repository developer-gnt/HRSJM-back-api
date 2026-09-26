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

export enum TicketStatus {
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

@Entity("support_tickets")
@Index("IX_support_tickets_user_id", ["userId"])
@Index("IX_support_tickets_status", ["status"])
export class SupportTicket {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "varchar", length: 200 })
  subject!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ type: "enum", enum: TicketStatus, default: TicketStatus.SUBMITTED })
  status!: TicketStatus;

  @Column({ type: "uuid", name: "resolved_by", nullable: true })
  resolvedBy!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "resolved_by" })
  resolvedByUser!: User | null;

  @Column({ type: "timestamptz", name: "resolved_at", nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}