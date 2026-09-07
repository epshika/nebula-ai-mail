import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { tokensRepo, usersRepo } from "../db/index.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function newOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent",
    scope: SCOPES,
  });
}

/**
 * Exchanges an OAuth `code` for tokens, fetches the user's profile,
 * persists both, and returns a fresh session id for the caller to
 * set as an httpOnly cookie. Tokens NEVER go to the frontend.
 */
export async function handleOAuthCallback(code: string): Promise<{
  sessionId: string;
  userId: string;
}> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.id || !profile.email) {
    throw new Error("Google did not return a user id/email — check OAuth scopes.");
  }

  usersRepo.upsert({
    id: profile.id,
    email: profile.email,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
  });

  tokensRepo.upsert(profile.id, {
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? null,
    expiry_date: tokens.expiry_date ?? null,
  });

  const sessionId = randomUUID();
  return { sessionId, userId: profile.id };
}

/**
 * Builds an authenticated OAuth2Client for a given user, wiring up
 * automatic refresh-token handling and persisting rotated access tokens.
 */
export function getAuthenticatedClientForUser(userId: string): OAuth2Client | null {
  const stored = tokensRepo.get(userId);
  if (!stored?.refresh_token && !stored?.access_token) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: stored.access_token ?? undefined,
    refresh_token: stored.refresh_token ?? undefined,
    scope: stored.scope ?? undefined,
    token_type: stored.token_type ?? undefined,
    expiry_date: stored.expiry_date ?? undefined,
  });

  client.on("tokens", (newTokens) => {
    tokensRepo.upsert(userId, {
      access_token: newTokens.access_token ?? stored.access_token,
      refresh_token: newTokens.refresh_token ?? stored.refresh_token,
      scope: newTokens.scope ?? stored.scope,
      token_type: newTokens.token_type ?? stored.token_type,
      expiry_date: newTokens.expiry_date ?? stored.expiry_date,
    });
  });

  return client;
}
