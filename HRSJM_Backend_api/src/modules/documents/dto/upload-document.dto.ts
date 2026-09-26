import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { DocumentType, RelatedEntityType } from "../entities/document.entity";

export class UploadDocumentDto {
  @ApiProperty({ example: "Membership proof" })
  @IsString()
  @Length(1, 150)
  documentName!: string;

  @ApiProperty({ enum: DocumentType })
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @ApiPropertyOptional({ enum: RelatedEntityType })
  @IsOptional()
  @IsEnum(RelatedEntityType)
  relatedEntityType?: RelatedEntityType;

  @ApiPropertyOptional({ example: "84246d63-32d5-4511-96ec-1d3df0fee92f" })
  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;

  @ApiPropertyOptional({ example: "Scanned copy of the signed form" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // Admin-only: upload on behalf of another user
  @ApiPropertyOptional({ description: "Admin only - owner of the document" })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}