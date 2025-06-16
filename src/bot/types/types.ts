import { Context, SessionFlavor } from "grammy";

export interface SessionData {
  state?: 'awaiting_github_username' | 'awaiting_repo_name';
}

export type MyContext = Context & SessionFlavor<SessionData>;