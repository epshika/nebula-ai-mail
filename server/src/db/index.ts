import Database from "better-sqlite3";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data.sqlite");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    picture TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    user_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    scope TEXT,
    token_type TEXT,
    expiry_date INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export interface StoredUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface StoredTokens {
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: number | null;
}

export const usersRepo = {
  upsert(user: StoredUser) {
    db.prepare(
      `INSERT INTO users (id, email, name, picture) VALUES (@id, @email, @name, @picture)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture`
    ).run(user);
  },
  get(id: string): StoredUser | undefined {
    return db.prepare(`SELECT id, email, name, picture FROM users WHERE id = ?`).get(id) as
      | StoredUser
      | undefined;
  },
};

export const tokensRepo = {
  upsert(userId: string, tokens: StoredTokens) {
    db.prepare(
      `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, scope, token_type, expiry_date)
       VALUES (@userId, @access_token, @refresh_token, @scope, @token_type, @expiry_date)
       ON CONFLICT(user_id) DO UPDATE SET
         access_token=excluded.access_token,
         refresh_token=COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
         scope=excluded.scope,
         token_type=excluded.token_type,
         expiry_date=excluded.expiry_date`
    ).run({ userId, ...tokens });
  },
  get(userId: string): StoredTokens | undefined {
    return db
      .prepare(
        `SELECT access_token, refresh_token, scope, token_type, expiry_date FROM oauth_tokens WHERE user_id = ?`
      )
      .get(userId) as StoredTokens | undefined;
  },
};

export const sessionsRepo = {
  create(sessionId: string, userId: string) {
    db.prepare(`INSERT INTO sessions (session_id, user_id) VALUES (?, ?)`).run(sessionId, userId);
  },
  getUserId(sessionId: string): string | undefined {
    return (
      db.prepare(`SELECT user_id FROM sessions WHERE session_id = ?`).get(sessionId) as
        | { user_id: string }
        | undefined
    )?.user_id;
  },
  destroy(sessionId: string) {
    db.prepare(`DELETE FROM sessions WHERE session_id = ?`).run(sessionId);
  },
};
