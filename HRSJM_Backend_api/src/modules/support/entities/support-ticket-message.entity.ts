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
import { SupportTicket } from "./support-ticket.entity";

@Entity("support_ticket_messages")
@Index("IX_support_ticket_messages_ticket_id", ["ticketId"])
export class SupportTicketMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", name: "ticket_id" })
  ticketId!: string;

  @ManyToOne(() => SupportTicket, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: SupportTicket;

  @Column({ type: "uuid", name: "author_id" })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "author_id" })
  author!: User;

  @Column({ type: "text" })
  body!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}