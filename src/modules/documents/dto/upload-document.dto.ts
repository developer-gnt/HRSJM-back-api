import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DocumentType,
  RelatedEntityType,
} from '../entities/document.entity';

export class UploadDocumentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  document_name: string;

  @IsEnum(DocumentType)
  document_type: DocumentType;

  @IsOptional()
  @IsEnum(RelatedEntityType)
  related_entity_type?: RelatedEntityType;

  @IsOptional()
  @IsUUID()
  related_entity_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  owner_id?: string; // When admin uploads on behalf of user
}
