import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Notification } from "./notification.entity";

// In-app delivery: rows are written at dispatch time with SENT.
// PENDING/FAILED are reserved for future channels (email, push).
export enum DeliveryStatus {
  PENDING = "PENDING",
  SENT = "SENT",
  FAILED = "FAILED",
}

@Entity("notification_recipients")
@Index("IX_notification_recipients_user_id", ["userId"])
@Index("IX_notification_recipients_notification_id", ["notificationId"])
export class NotificationRecipient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "notification_id" })
  notificationId!: string;

  @ManyToOne(() => Notification, { onDelete: "CASCADE" })
  @JoinColumn({ name: "notification_id" })
  notification!: Notification;

  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  @Column({ type: "enum", enum: DeliveryStatus, name: "delivery_status" })
  deliveryStatus!: DeliveryStatus;

  @Column({ type: "timestamptz", name: "read_at", nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}