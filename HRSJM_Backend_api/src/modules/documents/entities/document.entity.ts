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

export enum DocumentType {
  MEMBERSHIP_DOCUMENT = "MEMBERSHIP_DOCUMENT",
  ASSISTANCE_DOCUMENT = "ASSISTANCE_DOCUMENT",
  SUPPORT_TICKET_ATTACHMENT = "SUPPORT_TICKET_ATTACHMENT",
  CERTIFICATE = "CERTIFICATE",
  APPOINTMENT_LETTER = "APPOINTMENT_LETTER",
  OTHER = "OTHER",
}

export enum RelatedEntityType {
  MEMBERSHIP = "MEMBERSHIP",
  ASSISTANCE_REQUEST = "ASSISTANCE_REQUEST",
  SUPPORT_TICKET = "SUPPORT_TICKET",
  RECEIPT_ENTRY = "RECEIPT_ENTRY",
  OTHER = "OTHER",
}

@Entity("documents")
@Index("IX_documents_user_id", ["userId"])
@Index("IX_documents_related", ["relatedEntityType", "relatedEntityId"])
export class Document {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Owner of the document - decides who may view/download it
  @Column({ type: "uuid", name: "user_id" })
  userId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "user_id" })
  user!: User;

  // Who performed the upload (may differ from owner when an admin uploads on behalf)
  @Column({ type: "uuid", name: "created_by" })
  createdBy!: string;

  @Column({ type: "varchar", length: 150, name: "document_name" })
  documentName!: string;

  @Column({ type: "enum", enum: DocumentType, name: "document_type" })
  documentType!: DocumentType;

  // Random safe filename on disk - never the user-supplied name
  @Column({ type: "varchar", length: 255, name: "file_name" })
  fileName!: string;

  @Column({ type: "varchar", length: 255, name: "original_file_name" })
  originalFileName!: string;

  @Column({ type: "varchar", length: 100, name: "mime_type" })
  mimeType!: string;

  @Column({ name: "file_size" })
  fileSize!: number;

  @Column({ type: "varchar", length: 255, name: "storage_path" })
  storagePath!: string;

  @Column({
    type: "enum",
    enum: RelatedEntityType,
    name: "related_entity_type",
    nullable: true,
  })
  relatedEntityType!: RelatedEntityType | null;

  @Column({ type: "uuid", name: "related_entity_id", nullable: true })
  relatedEntityId!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  // Soft delete / archive - rows are never physically removed (BRD rule 10)
  @Column({ name: "is_archived", default: false })
  isArchived!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}