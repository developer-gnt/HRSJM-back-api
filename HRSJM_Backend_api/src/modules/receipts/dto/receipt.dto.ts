import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { ReceiptMethod } from "../entities/income-receipt.entity";

export class CreateReceiptDto {
  @ApiProperty({ example: "2026-09-28", description: "Income receipt date (YYYY-MM-DD)" })
  @IsDateString()
  receiptDate!: string;

  @ApiProperty({ example: "Abdul Karim" })
  @IsString()
  @MaxLength(150)
  receivedFrom!: string;

  @ApiProperty({ example: "Membership Fees" })
  @IsString()
  @MaxLength(100)
  incomeAccount!: string;

  @ApiProperty({ example: "Cash Box" })
  @IsString()
  @MaxLength(100)
  receivedInAccount!: string;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(9999999999)
  amount!: number;

  @ApiProperty({ enum: ReceiptMethod })
  @IsEnum(ReceiptMethod)
  method!: ReceiptMethod;

  @ApiPropertyOptional({ example: "Monthly membership fee for September" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class ListReceiptsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: "2026-09-30" })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ example: "Membership Fees" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  incomeAccount?: string;

  @ApiPropertyOptional({ example: "Cash Box" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receivedInAccount?: string;

  @ApiPropertyOptional({ enum: ReceiptMethod })
  @IsOptional()
  @IsEnum(ReceiptMethod)
  method?: ReceiptMethod;
}