import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { UserRole } from "../../users/entities/user.entity";

export class RegisterDto {
  @ApiProperty({ example: "Aisha Rahman" })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: "aisha@example.com" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Str0ngP@ss" })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: "password must contain upper case, lower case and a number",
  })
  password!: string;

  @ApiPropertyOptional({
    enum: ["MEMBER", "DONOR", "DONATION_SEEKER"],
    default: "MEMBER",
    description: "ADMIN cannot be self-assigned",
  })
  @IsOptional()
  @IsIn([UserRole.MEMBER, UserRole.DONOR, UserRole.DONATION_SEEKER])
  role?: UserRole;
}