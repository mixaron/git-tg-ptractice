import { Bot, session, SessionFlavor } from "grammy";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { startWeeklyReportScheduler } from "../reports/startWeeklyReport";
import { handleStartCommand, handleHelpCommand, handleAddRepoCommand, handleMyRepoCommand, handleDelRepoCommand, handleLinkGithubCommand, handleUnlinkGithubCommand, handleTextMessage } from "../bot/commands/commands";
import { MyContext, SessionData } from "./types/types";
import { handleSelectRepoToDelete, handleConfirmDeleteRepo, handleCancelDeleteRepo } from "./callbacks/callbacks";

config();
startWeeklyReportScheduler();

export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);
const prisma = new PrismaClient();

bot.use(
  session({
    initial: (): SessionData => ({}),
  })
);

bot.command("start", handleStartCommand);
bot.command("help", handleHelpCommand);
bot.command("addrepo", handleAddRepoCommand);
bot.command("myrepo", handleMyRepoCommand);
bot.command("delrepo", handleDelRepoCommand);
bot.command("linkgithub", handleLinkGithubCommand);
bot.command("unlinkgithub", handleUnlinkGithubCommand);

bot.on("message:text", handleTextMessage);

bot.callbackQuery(/^select_to_delete_repo_(\d+)_(\d+|null)$/, handleSelectRepoToDelete);
bot.callbackQuery(/^confirm_delete_(\d+)_(\d+|null)$/, handleConfirmDeleteRepo);
bot.callbackQuery(/^cancel_delete_(\d+)_(\d+|null)$/, handleCancelDeleteRepo);

bot.start();