import type { AiChatRequest, AiMode } from '@fluentdb/shared';

const BASE = `You are FluentDB's built-in database assistant. You help the user explore, query and understand their database.

Rules:
- Whenever you propose SQL, put it in a \`\`\`sql fenced code block. One statement per block.
- Match the SQL dialect given in the context exactly (quoting style, LIMIT syntax, functions).
- Never invent tables or columns that are not in the provided schema. If something is missing, say so.
- You cannot execute anything yourself; the user reviews and runs suggested SQL from the UI.
- Prefer safe, read-only queries unless the user explicitly asks for a mutation. For any UPDATE/DELETE, you MUST include a precise WHERE clause, and first propose a SELECT (with the same WHERE) so the user can check exactly which rows are affected before running the mutation. Never suggest an UPDATE/DELETE without a WHERE clause.
- Be concise. Answer in the language the user writes in.`;

const MODE_INSTRUCTIONS: Record<AiMode, string> = {
  chat: '',
  generate_sql:
    'Task: translate the user request into SQL for the schema below. Reply with a short explanation and the SQL in a ```sql block.',
  explain:
    'Task: explain what the given SQL does, step by step, referencing the schema. Point out potential performance issues (missing index, full scan) if relevant.',
  fix: 'Task: the given SQL failed with the given error. Diagnose the problem and reply with a corrected version in a ```sql block, plus one sentence on what was wrong.',
  explain_object:
    'Task: explain the database object described below (a table, view or materialized view) to the user. Say in plain language what it represents (what one row means), the role of its key columns, and how it relates to other tables (foreign keys, or — for a view/materialized view — what its definition computes and which tables it reads from). Be concrete and concise; do not dump the raw SQL back. Do not propose changes unless asked.',
  index_advice:
    "Task: you are an index advisor. Given the query, its execution-plan summary and the schema, propose the index(es) that would speed it up. Reply with each CREATE INDEX in its own ```sql block, using the exact dialect. Briefly justify each one (which scan/filter/join it targets). Only suggest indexes that match columns present in the schema. Always warn in one sentence that an index speeds up reads but slows down writes and uses disk space, so it should be weighed. If no index would help, say so plainly.",
  chartable_sql:
    'Task: the user wants to chart this query as a time trend, but it returns no plottable numeric column — values are formatted as text (e.g. sizes via pg_size_pretty like "1234 MB", percentages with a "%" sign, durations as text). Rewrite the query so at least one column is a raw number suitable for plotting: return sizes as a plain number (e.g. pg_total_relation_size(relid) / 1024.0 / 1024 / 1024 AS size_gb), strip units and formatting, and KEEP a short text label column (e.g. the table name) so each row can become its own series. Preserve the same ordering and dialect. Reply with one sentence on what you changed, then the adapted query in a ```sql block.',
};

/**
 * System prompt for the one-shot NL → scheduled-task proposal. The model must
 * answer with a single JSON object (no prose), read-only SQL only.
 */
export function buildMonitorPrompt(
  schemaDigest: string | null,
  dialectInfo: string | null,
): string {
  const parts = [
    BASE,
    `Task: turn the user's monitoring wish (in natural language) into ONE scheduled read-only check. Answer with a SINGLE JSON object and nothing else (no prose, no markdown fences needed), with this exact shape:
{
  "name": string,                       // short, human name for the task
  "sql": string,                        // ONE read-only SELECT, matching the dialect; no trailing semicolon needed
  "schedule": { "kind": "daily", "hour": 0-23, "minute": 0-59 }
             | { "kind": "interval", "everyMinutes": integer >= 1 },
  "alert": null
         | { "column": string, "op": "gt"|"gte"|"lt"|"lte", "threshold": number },
  "notes": string                       // one sentence, in the user's language, explaining the check
}
Rules for this task:
- The SQL MUST be read-only (SELECT / WITH … SELECT). Never write.
- If the user gives a time like "9h" use a daily schedule; "toutes les N minutes/heures" → interval.
- Set "alert" only if the user asked to be warned past a threshold; put it on the numeric column the SQL returns. Convert units to match the column (e.g. a size threshold in GB when the column is bytes). Otherwise "alert": null.
- Only reference tables/columns present in the schema below. If you cannot, still return your best SELECT and explain the assumption in "notes".`,
  ];
  if (dialectInfo) parts.push(`SQL dialect: ${dialectInfo}`);
  parts.push(
    schemaDigest
      ? `Connected database schema:\n${schemaDigest}`
      : 'No schema available — infer reasonable table/column names and note the assumption.',
  );
  return parts.join('\n\n');
}

/**
 * System prompt for generating realistic mock rows for one table. The model
 * must answer with a JSON array of row objects (column → value), nothing else.
 */
export function buildMockPrompt(
  table: string,
  columnLines: string[],
  count: number,
  dialectInfo: string | null,
): string {
  const parts = [
    BASE,
    `Task: generate ${count} rows of REALISTIC but FAKE test data for the table "${table}". Answer with a SINGLE JSON array of exactly ${count} objects and nothing else (no prose, no markdown fences needed). Each object maps a column name to a value.
Rules:
- Use ONLY the columns listed below. Do NOT include any other column (auto-increment keys are assigned by the database).
- Respect each column's type and the semantics implied by its name (e.g. an "email" column → plausible emails, "created_at"/date → ISO 8601 strings, "price"/"amount" → numbers, booleans → true/false).
- Non-nullable columns MUST always have a value; nullable ones may be null occasionally.
- For a foreign-key column, choose values ONLY from its "allowed" set; if that set is empty, use null.
- Vary values across rows — no copy-paste. Keep strings reasonably short and safe (no real personal data).
Columns:
${columnLines.join('\n')}`,
  ];
  if (dialectInfo) parts.push(`SQL dialect: ${dialectInfo}`);
  return parts.join('\n\n');
}

/** Hard cap on user-supplied context (~4k tokens) so it can't crowd out the schema. */
const CONTEXT_CHAR_BUDGET = 16_000;

export function buildSystemPrompt(
  req: AiChatRequest,
  schemaDigest: string | null,
  dialectInfo: string | null,
  objectDetail?: string | null,
  userContext?: string | null,
): string {
  const parts = [BASE];
  const modeInstruction = MODE_INSTRUCTIONS[req.mode];
  if (modeInstruction) parts.push(modeInstruction);
  if (dialectInfo) parts.push(`SQL dialect: ${dialectInfo}`);
  // User's business context comes BEFORE the schema: it's the authoritative
  // domain knowledge the model should trust for meaning (units, enums, joins).
  if (userContext && userContext.trim()) {
    const trimmed = userContext.trim().slice(0, CONTEXT_CHAR_BUDGET);
    parts.push(
      `Business context provided by the user for this database (authoritative — ` +
        `use it to interpret tables, columns, codes and relationships):\n${trimmed}`,
    );
  }
  if (objectDetail) parts.push(`Object to explain:\n${objectDetail}`);
  if (schemaDigest) {
    parts.push(`Connected database schema:\n${schemaDigest}`);
  } else {
    parts.push(
      'No database is connected — you can still discuss SQL in general.',
    );
  }
  if (req.context?.currentSql) {
    parts.push(`Current SQL in the editor:\n\`\`\`sql\n${req.context.currentSql}\n\`\`\``);
  }
  if (req.context?.error) {
    parts.push(`Last execution error:\n${req.context.error}`);
  }
  if (req.context?.planSummary) {
    parts.push(`Execution plan summary:\n${req.context.planSummary}`);
  }
  return parts.join('\n\n');
}

/**
 * A ready-to-paste prompt the user hands to their own coding agent (e.g.
 * Claude in their project). Given the real schema below plus the agent's
 * knowledge of the codebase, it produces the business-context document that
 * the user then pastes back into FluentDB's per-database AI context.
 */
export function buildContextExtractionPrompt(
  schemaDigest: string,
  dialectName: string,
  scope: string,
): string {
  return `Tu es un expert en modélisation de données. Je te fournis, en fin de message, le schéma réel d'une base **${dialectName}** (${scope}) qu'utilise mon projet — celui sur lequel tu travailles avec moi.

Objectif : rédiger un **document de contexte métier** destiné à un assistant IA SQL intégré à mon client de base de données. Cet assistant connaît DÉJÀ la structure (tables, colonnes, types, clés) ci-dessous : n'la répète pas. Apporte le **SENS** que le schéma seul ne donne pas, pour qu'il écrive des requêtes correctes et interprète bien les résultats.

Appuie-toi sur **le code de mon projet** (modèles, migrations, requêtes, logique métier) ET sur le schéma ci-dessous. **N'invente rien** : si tu n'es pas certain, écris « (à confirmer) ».

Réponds UNIQUEMENT avec un document **Markdown**, concis et factuel, avec ces sections (omets celles sans information utile) :

## Domaine
But de l'application et rôle de chaque table importante (1 ligne par table : que représente une ligne ?).

## Unités & formats
Colonnes dont la valeur brute induit en erreur : montants (centimes ? devise ?), durées, timestamps (UTC ? fuseau ?), booléens stockés en entier, JSON, etc.

## Codes & énumérations
Pour chaque colonne de type statut / état / type : la signification de chaque valeur (ex. \`status\`: 1=créée, 2=payée, 3=expédiée…).

## Relations & jointures canoniques
Jointures habituelles entre tables + cardinalité ; clés étrangères **implicites** non déclarées au niveau SQL.

## Règles métier
Filtres à toujours appliquer (soft-delete \`deleted_at IS NULL\`, multi-tenant), invariants, définitions métier (« client actif = … »).

## Pièges
Colonnes dépréciées, doublons de sens, tables à éviter, champs dénormalisés, unités incohérentes.

## Requêtes types
2 à 4 requêtes fréquentes, commentées.

Contraintes : reste sous ~400 lignes, va à l'essentiel, pas de bla-bla d'introduction ni de conclusion — juste le document, prêt à coller.

--- SCHÉMA DE LA BASE ---
${schemaDigest}`;
}
