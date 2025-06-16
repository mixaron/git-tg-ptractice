import express from "express";
import { PrismaClient } from "@prisma/client";
import { bot } from "../bot/bot";
import { isValidSignature } from "./validators/isValidSignature";
import { escapeMarkdown } from "./utils/escapeMarkdown";
import { processCommits } from "./services/processCommits";
import { sendCommitMessages } from "./services/sendCommitMessages";

const router = express.Router();
const prisma = new PrismaClient();

router.post("/", express.json(), async (req, res) => {
  try {
    if (!isValidSignature(req, process.env.WEBHOOK_SECRET || "", req.body, req.headers)) {
      return res.status(403).send("Invalid signature");
    }

    const { repository, commits, ref, sender } = req.body;

    if (!repository?.name || !commits || !Array.isArray(commits)) {
      return res.status(400).send("Bad request: Missing repository name or commits array.");
    }

    const repo = await prisma.repository.findUnique({
      where: { fullName: repository.full_name },
    });

    if (!repo) return res.status(400).send("Repository not registered via bot.");

    const binding = await prisma.chatBinding.findFirst({
      where: { repositoryId: repo.id },
    });

    if (!binding) return res.status(400).send("No chat binding found for this repository.");

    const user = await prisma.user.upsert({
      where: { githubLogin: sender.login },
      update: {},
      create: {
        githubLogin: sender.login,
        telegramName: sender.login,
        telegramId: 0,
      },
    });

    const branch = ref?.split("/")?.pop() ?? "unknown";

    await processCommits(prisma, commits, branch, repo.id, user.id);

    const messages = commits.map((commit: any) => {
      const sha = commit.id.substring(0, 7);
      const additions = commit.added?.length || 0;
      const deletions = commit.removed?.length || 0;
      const modified = commit.modified?.length || 0;
      const filesChanged = additions + deletions + modified;

      const author = escapeMarkdown(commit.author?.name || sender.login);
      const message = escapeMarkdown(commit.message.split("\n")[0]);

      return (
        `*${escapeMarkdown(repository.name)}* \`(${escapeMarkdown(branch)})\`\n` +
        `👤 [${author}](https://github.com/${sender.login})\n` +
        `📌 [${sha}](${commit.url}) — ${message}\n` +
        `📊 ${escapeMarkdown(`+${additions}/-${deletions} (${filesChanged} файл(ов))`)}`
      );
    });

    await sendCommitMessages(bot, messages, binding.chatId, binding.threadId);

    res.status(200).send("OK");
  } catch (error) {
    console.error("Ошибка обработки вебхука:", error);
    res.status(500).send("Internal server error");
  }
});

export default router;
