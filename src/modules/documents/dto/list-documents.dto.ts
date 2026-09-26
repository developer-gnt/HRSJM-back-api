import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  DocumentType,
  RelatedEntityType,
} from '../entities/document.entity';

export class ListDocumentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(DocumentType)
  document_type?: DocumentType;

  @IsOptional()
  @IsEnum(RelatedEntityType)
  related_entity_type?: RelatedEntityType;

  @IsOptional()
  @IsUUID()
  related_entity_id?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;
}
