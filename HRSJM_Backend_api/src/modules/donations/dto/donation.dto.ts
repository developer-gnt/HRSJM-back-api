import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { DonationMethod, DonationStatus } from "../entities/donation.entity";

export class CreateDonationDto {
  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(9999999999)
  amount!: number;

  @ApiProperty({ enum: DonationMethod })
  @IsEnum(DonationMethod)
  paymentMethod!: DonationMethod;

  @ApiPropertyOptional({ example: "2026-09-28" })
  @IsOptional()
  @IsDateString()
  donationDate?: string;

  @ApiPropertyOptional({ example: "Orphan Care" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  cause?: string;

  @ApiPropertyOptional({ example: "TRX-773410" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;

  @ApiPropertyOptional({ example: "Monthly zakat" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class CreateGuestDonationDto extends CreateDonationDto {
  @ApiProperty({ example: "Rafiq Mahmood" })
  @IsString()
  @MaxLength(150)
  donorName!: string;

  @ApiPropertyOptional({ example: "rafiq@example.com" })
  @IsOptional()
  @IsEmail()
  donorEmail?: string;

  @ApiPropertyOptional({ example: "+8801712345678" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  donorMobile?: string;
}

export class UpdateDonationStatusDto {
  @ApiProperty({ enum: DonationStatus })
  @IsEnum(DonationStatus)
  status!: DonationStatus;

  // Display-only receipt reference from the senior accounting system
  @ApiPropertyOptional({ example: "RCV-2026-0007" })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  receiptNumber?: string;

  @ApiPropertyOptional({ example: "Bank slip verified" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class ListDonationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DonationStatus })
  @IsOptional()
  @IsEnum(DonationStatus)
  status?: DonationStatus;

  @ApiPropertyOptional({ enum: DonationMethod })
  @IsOptional()
  @IsEnum(DonationMethod)
  method?: DonationMethod;

  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: "2026-09-30" })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: "Search in donor name and email" })
  @IsOptional()
  @IsString()
  search?: string;
}