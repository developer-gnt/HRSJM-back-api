import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';

export enum DocumentType {
  MEMBERSHIP_DOCUMENT = 'MEMBERSHIP_DOCUMENT',
  ASSISTANCE_DOCUMENT = 'ASSISTANCE_DOCUMENT',
  SUPPORT_TICKET_ATTACHMENT = 'SUPPORT_TICKET_ATTACHMENT',
  CERTIFICATE = 'CERTIFICATE',
  APPOINTMENT_LETTER = 'APPOINTMENT_LETTER',
  OTHER = 'OTHER',
}

export enum RelatedEntityType {
  MEMBERSHIP = 'MEMBERSHIP',
  ASSISTANCE_REQUEST = 'ASSISTANCE_REQUEST',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  RECEIPT_ENTRY = 'RECEIPT_ENTRY',
  OTHER = 'OTHER',
}

@Entity('documents')
@Index('idx_documents_user_id', ['user_id'])
@Index('idx_documents_related', ['related_entity_type', 'related_entity_id'])
export class DocumentEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 150 })
  document_name: string;

  @Column({ type: 'varchar', length: 50, default: DocumentType.OTHER })
  document_type: DocumentType;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 255 })
  original_file_name: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'int' })
  file_size: number;

  @Column({ type: 'varchar', length: 255 })
  storage_path: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  related_entity_type: RelatedEntityType | null;

  @Column({ type: 'uuid', nullable: true })
  related_entity_id: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  is_archived: boolean;
}
