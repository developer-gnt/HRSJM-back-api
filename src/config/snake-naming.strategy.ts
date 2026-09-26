import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/**
 * snake_case naming for tables and columns (project naming standard).
 * Entities should still set explicit plural table names via @Entity('users').
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName?: string): string {
    return customName ?? toSnakeCase(className);
  }

  columnName(
    propertyName: string,
    customName?: string,
    embeddedPrefixes: string[] = [],
  ): string {
    const prefix = embeddedPrefixes.map((p) => toSnakeCase(p) + '_').join('');
    return prefix + (customName ?? toSnakeCase(propertyName));
  }

  relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(relationName + '_' + referencedColumnName);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    joinTable?: string,
  ): string {
    return toSnakeCase(
      firstTableName +
        '_' +
        (joinTable ?? secondTableName) +
        '_' +
        secondTableName,
    );
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return toSnakeCase(tableName + '_' + (columnName ?? propertyName));
  }
}
