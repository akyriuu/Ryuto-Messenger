import { IsString, MaxLength } from 'class-validator';

export class UpdateAvatarDto {
  @IsString()
  @MaxLength(1_500_000)
  avatarUrl: string;
}
