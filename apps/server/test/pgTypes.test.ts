import { describe, expect, it } from 'vitest';
import { shortenPgType } from '../src/drivers/postgres/pgTypes.js';

describe('shortenPgType', () => {
  it('shortens character varying, keeping the length', () => {
    expect(shortenPgType('character varying(255)')).toBe('varchar(255)');
    expect(shortenPgType('character varying')).toBe('varchar');
  });

  it('shortens character (fixed length) to char', () => {
    expect(shortenPgType('character(10)')).toBe('char(10)');
  });

  it('shortens timestamp/time with/without time zone', () => {
    expect(shortenPgType('timestamp with time zone')).toBe('timestamptz');
    expect(shortenPgType('timestamp without time zone')).toBe('timestamp');
    expect(shortenPgType('time with time zone')).toBe('timetz');
    expect(shortenPgType('time without time zone')).toBe('time');
  });

  it('shortens bit varying', () => {
    expect(shortenPgType('bit varying(8)')).toBe('varbit(8)');
  });

  it('leaves already-concise / other types untouched', () => {
    expect(shortenPgType('integer')).toBe('integer');
    expect(shortenPgType('numeric(10,2)')).toBe('numeric(10,2)');
    expect(shortenPgType('jsonb')).toBe('jsonb');
    expect(shortenPgType('integer[]')).toBe('integer[]');
    expect(shortenPgType('double precision')).toBe('double precision');
  });
});
