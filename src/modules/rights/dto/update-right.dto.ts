import { PartialType } from '@nestjs/swagger';
import { CreateRightDto } from './create-right.dto';

export class UpdateRightDto extends PartialType(CreateRightDto) {}
