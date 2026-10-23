import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private getSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error('Configure o segredo JWT.');
    }

    return secret;
  }

  async register(dto: RegisterDto) {
    const username = dto.username.trim();

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException(
        'A senha não pode exceder 72 bytes em UTF-8.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      throw new ConflictException('Este nome de usuário já está em uso.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        username,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });
  }

  async login(dto: LoginDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username.trim() },
    });

    if (!user) {
      throw new UnauthorizedException('Nome de usuário ou senha inválidos.');
    }

    const passwordIsValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
      },
      this.getSecret(),
      {
        expiresIn: '7d',
      },
    );

    return {
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const match =
      /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        avatarUrl,
      );

    if (!match) {
      throw new BadRequestException(
        'Envie uma imagem PNG, JPG, WEBP, ou GIF válida.',
      );
    }

    const imageBytes = Buffer.from(match[2], 'base64');

    if (imageBytes.length > 1024 * 1024) {
      throw new BadRequestException('A imagem deve ter no máximo 1 MB.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, username: true, avatarUrl: true },
    });

    return user;
  }
}
