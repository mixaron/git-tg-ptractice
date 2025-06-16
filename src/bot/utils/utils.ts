import { PrismaClient } from "@prisma/client";
import { MyContext } from "../types/types";

const prisma = new PrismaClient();

export async function getUserWithRepos(telegramId: bigint) {
  return prisma.user.findUnique({
    where: { telegramId },
    include: {
      repositories: {
        include: { repository: true },
      },
    },
  });
}

export function checkContextIds(ctx: MyContext): { userId: bigint | null; chatId: bigint | null } {
  const userId = ctx.from?.id ? BigInt(ctx.from.id) : null;
  const chatId = ctx.chat?.id ? BigInt(ctx.chat.id) : null;

  if (userId === null) {
    ctx.reply("⚠️ Ошибка: не удалось определить ваш ID пользователя Telegram.");
  }
  if (chatId === null) {
    ctx.reply("⚠️ Ошибка: не удалось определить ID чата.");
  }
  return { userId, chatId };
}

export function escapeMarkdownForAuthorLink(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

export async function formatCommitAuthorLink(githubLogin: string, authorName: string = githubLogin): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { githubLogin: githubLogin },
      select: { telegramName: true, telegramId: true }
    });

    if (user && user.telegramName) {
      return `👤 @${escapeMarkdownForAuthorLink(user.telegramName)} (GitHub: [${escapeMarkdownForAuthorLink(githubLogin)}](https://github.com/${escapeMarkdownForAuthorLink(githubLogin)}))`;
    } else {
      return `👤 [${escapeMarkdownForAuthorLink(authorName)}](https://github.com/${escapeMarkdownForAuthorLink(githubLogin)})`;
    }
  } catch (error) {
    console.error("Ошибка при форматировании автора коммита:", error);
    return `👤 [${escapeMarkdownForAuthorLink(authorName)}](https://github.com/${escapeMarkdownForAuthorLink(githubLogin)})`;
  }
}