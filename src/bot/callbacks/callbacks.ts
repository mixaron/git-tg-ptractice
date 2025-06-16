import { InlineKeyboard } from "grammy";
import { PrismaClient } from "@prisma/client";
import { MyContext } from "../types/types";
import { escapeMarkdownForAuthorLink, checkContextIds } from "../utils/utils";

const prisma = new PrismaClient();

export async function handleDeleteRepoCallback(ctx: MyContext) {
  await ctx.answerCallbackQuery();
  const repoId = parseInt(ctx.match![1]);
  const threadIdFromCallback = ctx.match![2] === 'null' ? null : parseInt(ctx.match![2]);

  if (isNaN(repoId)) return ctx.reply("⚠️ Ошибка: неверный ID репозитория.");

  try {
    const repoToDelete = await prisma.repository.findUnique({ where: { id: repoId } });
    if (!repoToDelete) return ctx.reply("Репозиторий не найден.");

    const confirmationKeyboard = new InlineKeyboard()
      .text("✅ Да, удалить", `confirm_delete_${repoId}_${threadIdFromCallback !== null ? threadIdFromCallback : 'null'}`)
      .text("❌ Нет, отмена", `cancel_delete_${repoId}_${threadIdFromCallback !== null ? threadIdFromCallback : 'null'}`);

    await ctx.editMessageText(`Вы уверены, что хотите удалить репозиторий *${escapeMarkdownForAuthorLink(repoToDelete.fullName)}*${threadIdFromCallback !== null ? ` (Тема: ${escapeMarkdownForAuthorLink(repoToDelete.name)})` : ''}?`, {
      reply_markup: confirmationKeyboard,
      parse_mode: "Markdown",
    });
  } catch (e) {
    console.error("Ошибка при подготовке к удалению:", e);
    await ctx.reply("⚠️ Произошла ошибка при подготовке к удалению.");
  }
}

export async function handleConfirmDeleteCallback(ctx: MyContext) {
  await ctx.answerCallbackQuery("Удаляем репозиторий...");
  const repoId = parseInt(ctx.match![1]);
  const threadIdFromCallback = ctx.match![2] === 'null' ? null : parseInt(ctx.match![2]);

  const { userId, chatId } = checkContextIds(ctx);

  if (isNaN(repoId) || userId === null || chatId === null) return;

  try {
    const user = await prisma.user.findUnique({ where: { telegramId: userId } });
    if (!user) {
      await ctx.reply("Пользователь не найден в системе.");
      return;
    }

    const bindingToRemove = await prisma.chatBinding.findFirst({
      where: {
        repositoryId: repoId,
        chatId: chatId,
        threadId: threadIdFromCallback,
      },
      include: {
        repository: true
      }
    });

    if (!bindingToRemove) {
      // Ensure ctx.callbackQuery and message exist before accessing message_id
      const replyToMessageId = ctx.callbackQuery?.message?.message_id;
      await ctx.reply(
        "Привязка репозитория к этому чату/теме не найдена или уже удалена. Возможно, это была привязка к топику, а кнопка из главного чата.",
        replyToMessageId ? { reply_to_message_id: replyToMessageId } : undefined
      );
      return;
    }

    const repoFullName = bindingToRemove.repository.fullName;
    const repoName = bindingToRemove.repository.name;

    await prisma.chatBinding.deleteMany({
      where: {
        repositoryId: repoId,
        chatId: chatId,
        threadId: threadIdFromCallback,
      },
    });

    const remainingBindingsInThisChat = await prisma.chatBinding.count({
      where: {
        repositoryId: repoId,
        chatId: chatId,
      }
    });

    if (threadIdFromCallback !== null) {
      if (remainingBindingsInThisChat === 0) {
        try {
          await ctx.api.deleteForumTopic(Number(chatId), Number(threadIdFromCallback));
          await ctx.editMessageText(`🗑️ Тема для репозитория *${escapeMarkdownForAuthorLink(repoName)}* удалена.`, { parse_mode: "Markdown" });
        } catch (topicDeleteError: any) {
          console.error(`Ошибка при удалении темы ${threadIdFromCallback} для репозитория ${repoId} в чате ${chatId}:`, topicDeleteError);
          if (topicDeleteError.description?.includes('not enough rights to manage topics')) {
            await ctx.editMessageText("⚠️ Не удалось удалить тему форума: у бота недостаточно прав. Пожалуйста, выдайте боту разрешение 'Управлять темами'.", { parse_mode: "Markdown" });
          } else if (topicDeleteError.description?.includes('thread not found')) {
            await ctx.editMessageText("⚠️ Не удалось удалить тему форума: тема не найдена. Возможно, она уже удалена.", { parse_mode: "Markdown" });
          } else {
            await ctx.editMessageText("⚠️ Не удалось удалить соответствующую тему форума. Пожалуйста, проверьте логи бота.", { parse_mode: "Markdown" });
          }
        }
      } else {
        await ctx.editMessageText(`Привязка репозитория *${escapeMarkdownForAuthorLink(repoFullName)}* к этой теме удалена. Но тема не была удалена, так как репозиторий все еще отслеживается в других местах этого чата.`, { parse_mode: "Markdown" });
      }
    } else {
      await ctx.editMessageText(`Привязка репозитория *${escapeMarkdownForAuthorLink(repoFullName)}* к основному чату удалена. Темы форума не удаляются, если привязка была к основному чату.`, { parse_mode: "Markdown" });
    }

    const totalRemainingChatBindingsForRepo = await prisma.chatBinding.count({
      where: {
        repositoryId: repoId,
      }
    });

    if (totalRemainingChatBindingsForRepo === 0) {
      await prisma.repositoryUser.deleteMany({
        where: { repositoryId: repoId }
      });

      await prisma.repository.delete({
        where: { id: repoId }
      });
      console.log(`Репозиторий ${repoFullName} (${repoId}) полностью удален из БД, так как не имеет активных привязок к чатам.`);

      await ctx.editMessageText(`✅ Репозиторий *${escapeMarkdownForAuthorLink(repoFullName)}* полностью удален из системы.`, { parse_mode: "Markdown" });
    }
  } catch (e: any) {
    console.error("Ошибка при удалении репозитория:", e);
    await ctx.reply("⚠️ Не удалось удалить репозиторий. Пожалуйста, попробуйте позже.");
  }
}

export async function handleCancelDeleteCallback(ctx: MyContext) {
  await ctx.answerCallbackQuery("Удаление отменено.");
  const repoId = parseInt(ctx.match![1]);
  const threadIdFromCallback = ctx.match![2] === 'null' ? null : parseInt(ctx.match![2]);

  try {
    const repoInfo = await prisma.repository.findUnique({ where: { id: repoId }, select: { fullName: true, name: true } });
    const repoFullName = repoInfo ? repoInfo.fullName : "репозиторий";
    const repoName = repoInfo ? repoInfo.name : "репозиторий";

    let messageText = `❌ Удаление *${escapeMarkdownForAuthorLink(repoFullName)}* отменено.`;
    if (threadIdFromCallback !== null) {
      messageText += ` (Тема: ${escapeMarkdownForAuthorLink(repoName)})`;
    }

    await ctx.editMessageText(messageText, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Ошибка при отмене удаления:", e);
    await ctx.reply("⚠️ Ошибка при отмене.");
  }
}