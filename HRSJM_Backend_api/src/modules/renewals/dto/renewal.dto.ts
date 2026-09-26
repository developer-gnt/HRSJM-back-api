import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import {
  RenewalPaymentMethod,
  RenewalPaymentStatus,
  RenewalStatus,
} from "../entities/renewal-request.entity";

export class CreateRenewalDto {
  @ApiProperty({ example: "84246d63-32d5-4511-96ec-1d3df0fee92f" })
  @IsUUID()
  membershipId!: string;

  @ApiProperty({ example: 1, description: "Renewal period in years (policy-configurable)" })
  @IsInt()
  @Min(1)
  @Max(10)
  periodYears!: number;

  @ApiProperty({ enum: RenewalPaymentMethod, example: RenewalPaymentMethod.BANK_TRANSFER })
  @IsEnum(RenewalPaymentMethod)
  paymentMethod!: RenewalPaymentMethod;

  @ApiPropertyOptional({ example: "TRX-889921" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;

  @ApiPropertyOptional({ example: "Renewing for the next year" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class UpdateRenewalPaymentDto {
  @ApiProperty({ enum: RenewalPaymentStatus, example: RenewalPaymentStatus.SUCCESS })
  @IsEnum(RenewalPaymentStatus)
  paymentStatus!: RenewalPaymentStatus;

  @ApiPropertyOptional({ example: "TRX-889921" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transactionId?: string;
}

export class ReviewRenewalDto {
  @ApiPropertyOptional({ example: "Payment slip verified" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminRemark?: string;
}

export class ListRenewalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RenewalStatus })
  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @ApiPropertyOptional({ enum: RenewalPaymentStatus })
  @IsOptional()
  @IsEnum(RenewalPaymentStatus)
  paymentStatus?: RenewalPaymentStatus;

  @ApiPropertyOptional({ example: "84246d63-32d5-4511-96ec-1d3df0fee92f" })
  @IsOptional()
  @IsUUID()
  membershipId?: string;
}