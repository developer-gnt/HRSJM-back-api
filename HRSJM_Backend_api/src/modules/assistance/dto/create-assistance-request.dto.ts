import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateAssistanceRequestDto {
  @ApiProperty({ example: "Aisha Rahman" })
  @IsString()
  @Length(2, 150)
  fullName!: string;

  @ApiProperty({ example: "+8801712345678" })
  @IsString()
  @Matches(/^\+?[0-9\s\-]{7,15}$/, { message: "mobile must be a valid phone number" })
  mobile!: string;

  @ApiPropertyOptional({ example: "aisha@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: "25000.00" })
  @IsNumberString(undefined, { message: "requestedAmount must be a numeric amount" })
  requestedAmount!: string;

  @ApiProperty({ example: "Emergency medical treatment for my daughter" })
  @IsString()
  @Length(5, 2000)
  reason!: string;

  @ApiPropertyOptional({ example: "Additional context about the situation" })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}