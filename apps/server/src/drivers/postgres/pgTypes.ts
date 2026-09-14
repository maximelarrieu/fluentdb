/**
 * Shorten PostgreSQL's verbose canonical type names to their concise aliases
 * for display. Lengths / precisions already present in `format_type` output are
 * preserved, e.g.:
 *   "character varying(255)"     -> "varchar(255)"
 *   "timestamp with time zone"   -> "timestamptz"
 *   "timestamp without time zone"-> "timestamp"
 *   "character(10)"              -> "char(10)"
 */
export function shortenPgType(type: string): string {
  if (!type) return type;
  return (
    type
      // Compound forms first, before the shorter bases they contain.
      .replace(/\bcharacter varying\b/gi, 'varchar')
      .replace(/\bbit varying\b/gi, 'varbit')
      .replace(/\bcharacter\b/gi, 'char')
      .replace(/\btimestamp with time zone\b/gi, 'timestamptz')
      .replace(/\btimestamp without time zone\b/gi, 'timestamp')
      .replace(/\btime with time zone\b/gi, 'timetz')
      .replace(/\btime without time zone\b/gi, 'time')
  );
}
