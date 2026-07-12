/** A database role/user and its attributes, for the roles & privileges view. */
export interface DbRole {
  name: string;
  /** Whether the role can log in (a "user"). */
  canLogin: boolean;
  /** Attribute/privilege flags (SUPERUSER, CREATEDB… or granted privileges). */
  attributes: string[];
  /** Roles this one is a member of. */
  memberOf: string[];
}
