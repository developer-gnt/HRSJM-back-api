import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum KitFulfillmentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DISPATCHED = 'DISPATCHED',
  DELIVERED = 'DELIVERED',
}

export class KitFulfillmentDto {
  @IsOptional()
  @IsEnum(KitFulfillmentStatus)
  status?: KitFulfillmentStatus;

  @IsOptional()
  @IsString()
  courier_name?: string;

  @IsOptional()
  @IsString()
  tracking_number?: string;

  @IsOptional()
  @IsString()
  dispatch_date?: string;

  @IsOptional()
  @IsString()
  delivery_address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  items?: string[];
}

