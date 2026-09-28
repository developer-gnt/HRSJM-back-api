import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { NotificationRecipient } from "./notification-recipient.entity";

export enum NotificationAudience {
  ALL_USERS = "ALL_USERS",
  MEMBERS = "MEMBERS",
  DONORS = "DONORS",
  DONATION_SEEKERS = "DONATION_SEEKERS",
  SPECIFIC_USER = "SPECIFIC_USER",
}

export enum NotificationStatus {
  SCHEDULED = "SCHEDULED",
  SENT = "SENT",
}

@Entity("notifications")
@Index("IX_notifications_status", ["status"])
@Index("IX_notifications_created_by", ["createdBy"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 150 })
  title!: string;

  @Column({ type: "text" })
  body!: string;

  @Column({ type: "enum", enum: NotificationAudience, name: "target_audience" })
  targetAudience!: NotificationAudience;

  @Column({ type: "enum", enum: NotificationStatus, default: NotificationStatus.SCHEDULED })
  status!: NotificationStatus;

  // When set and in the future the ticker dispatches at that time;
  // null/absent means send immediately on creation.
  @Column({ type: "timestamptz", name: "scheduled_at", nullable: true })
  scheduledAt!: Date | null;

  @Column({ type: "timestamptz", name: "sent_at", nullable: true })
  sentAt!: Date | null;

  @Column({ type: "uuid", name: "created_by" })
  createdBy!: string;

  @OneToMany(() => NotificationRecipient, (recipient) => recipient.notification)
  recipients!: NotificationRecipient[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}