import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from './snake-naming.strategy';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'hrsjm',
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    autoLoadEntities: true,
    migrationsRun: false,
    logging: process.env.DATABASE_LOGGING === 'true',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  }),
);
