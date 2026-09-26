import 'dotenv/config';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from '../config/snake-naming.strategy';

/**
 * Standalone TypeORM data source for the migration CLI.
 * Kept free of NestJS dependencies so the TypeORM CLI can load it directly.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  database: process.env.DATABASE_NAME ?? 'hrsjm',
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  namingStrategy: new SnakeNamingStrategy(),
  entities: ['src/modules/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
});
