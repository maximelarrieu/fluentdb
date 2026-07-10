import { describe, expect, it } from 'vitest';
import type { ErdSchema } from '@fluentdb/shared';
import { toDbml } from './dbml.js';

const schema: ErdSchema = {
  tables: [
    {
      name: 'artists',
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isForeignKey: false, nullable: false },
        { name: 'name', dataType: 'TEXT', isPrimaryKey: false, isForeignKey: false, nullable: false },
      ],
    },
    {
      name: 'albums',
      columns: [
        { name: 'id', dataType: 'INTEGER', isPrimaryKey: true, isForeignKey: false, nullable: false },
        { name: 'artist_id', dataType: 'INTEGER', isPrimaryKey: false, isForeignKey: true, nullable: true },
      ],
    },
  ],
  relations: [
    {
      name: 'fk_albums_artist',
      from: { table: 'albums', columns: ['artist_id'] },
      to: { table: 'artists', columns: ['id'] },
    },
  ],
};

describe('toDbml', () => {
  it('emits Table blocks with pk/not null attributes', () => {
    const dbml = toDbml(schema);
    expect(dbml).toContain('Table artists {');
    expect(dbml).toContain('id INTEGER [pk]');
    expect(dbml).toContain('name TEXT [not null]');
  });

  it('emits a Ref for the foreign key', () => {
    expect(toDbml(schema)).toContain('Ref: albums.artist_id > artists.id');
  });

  it('quotes non-word identifiers', () => {
    const dbml = toDbml({
      tables: [
        {
          name: 'weird name',
          columns: [
            { name: 'col', dataType: 'TEXT', isPrimaryKey: false, isForeignKey: false, nullable: true },
          ],
        },
      ],
      relations: [],
    });
    expect(dbml).toContain('Table "weird name" {');
  });
});
