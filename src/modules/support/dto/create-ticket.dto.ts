import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsArray()
  attachments?: Array<{
    name: string;
    uri?: string;
    size?: number;
    formattedSize?: string;
    type?: string;
    base64?: string;
  }>;
}
