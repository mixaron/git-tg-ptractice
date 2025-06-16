import { PrismaClient } from '@prisma/client';
import { format, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { escapeMarkdown } from '../webhook/utils/escapeMarkdown';
import { bot } from '../bot/bot';

const prisma = new PrismaClient();

export async function generateWeeklyReport(): Promise<void> {
  const now = new Date();
  const weekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  const repositories = await prisma.repository.findMany({
    include: { chatBindings: true },
  });

  for (const repo of repositories) {
    const commits = await prisma.commit.findMany({
      where: {
        repositoryId: repo.id,
        committedAt: { gte: weekStart, lte: weekEnd },
      },
      include: { author: true },
    });

    const stats = new Map<number, { count: number; user: any }>();
    for (const commit of commits) {
      if (!commit.author) continue;
      const key = commit.author.id;
      const current = stats.get(key);
      stats.set(key, {
        count: current ? current.count + 1 : 1,
        user: commit.author,
      });
    }

    let report = `📊 *${escapeMarkdown('Еженедельный отчет для')}* ${escapeMarkdown(repo.name)}\n`;
    report += `*${escapeMarkdown('Период')}*: ${escapeMarkdown(format(weekStart, 'dd.MM.yyyy'))} \\- ${escapeMarkdown(format(weekEnd, 'dd.MM.yyyy'))}\n\n`;

    if (stats.size === 0) {
      report += `${escapeMarkdown('На этой неделе коммитов не было.')}`;
    } else {
      report += `*${escapeMarkdown('Топ участников:')}*\n`;
      report += `${escapeMarkdown('----------------------------------')}\n`;

      const sorted = [...stats.values()].sort((a, b) => b.count - a.count);
      sorted.forEach((entry, i) => {
        const name = entry.user.telegramName || entry.user.githubLogin || 'N/A';
        const githubLogin = entry.user.githubLogin || 'N/A';
        let line = `${i + 1}\\. `;

        if (entry.user.telegramName) {
          line += `${escapeMarkdown(name)} \\(GitHub\\: ${escapeMarkdown(githubLogin)}\\)`;
        } else {
          line += `${escapeMarkdown(name)}`;
        }

        line += ` — *${escapeMarkdown(entry.count.toString())}* ${escapeMarkdown('коммит(ов)')}\n`;
        report += line;
      });

      report += `${escapeMarkdown('----------------------------------')}\n`;
      report += `\n*${escapeMarkdown('Всего коммитов')}*: ${escapeMarkdown(commits.length.toString())}`;
    }

    for (const binding of repo.chatBindings) {
      try {
        await bot.api.sendMessage(
          Number(binding.chatId),
          report,
          {
            parse_mode: 'MarkdownV2',
            message_thread_id: binding.threadId ?? undefined,
          }
        );
      } catch (error) {
        console.error(`Ошибка отправки отчета в чат ${binding.chatId} (${repo.name}):`, error);
      }
    }

    await prisma.weeklyReport.create({
      data: {
        repositoryId: repo.id,
        weekStart,
        weekEnd,
        stats: JSON.stringify(
          Object.fromEntries(
            [...stats.entries()].map(([id, val]) => [
              id.toString(),
              {
                count: val.count,
                userId: val.user.id.toString(),
                githubLogin: val.user.githubLogin,
                telegramName: val.user.telegramName,
              },
            ])
          )
        ),
        sentAt: now,
      },
    });
  }
}
