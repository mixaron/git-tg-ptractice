import { Keyboard, InlineKeyboard } from "grammy";
import { checkContextIds, escapeMarkdownForAuthorLink, getUserWithRepos } from "../utils/utils";
import { MyContext } from "../types/types";
import { prisma } from "../../db/db";

export async function handleStartCommand(ctx: MyContext) {
  const { userId } = checkContextIds(ctx);
  if (userId === null) return;

  const userName = ctx.from?.username;

  try {
    await prisma.user.upsert({
      where: { telegramId: userId },
      update: { telegramName: userName || null },
      create: { telegramId: userId, telegramName: userName || null },
    });
    console.log(`Пользователь ${userId} (${userName || 'N/A'}) зарегистрирован/обновлен.`);
  } catch (e) {
    console.error("Ошибка при регистрации/обновлении пользователя:", e);
    return ctx.reply("⚠️ Произошла ошибка при регистрации вас в системе.");
  }

  const replyMarkup = {
    keyboard: [
      [{ text: "➕ Добавить репозиторий" }],
      [{ text: "📋 Мои репозитории" }],
      [{ text: "❓ Помощь" }],
      [{ text: "🔗 Привязать GitHub" }, { text: "🗑️ Отвязать GitHub" }],
      [{ text: "🤡 Отвязать репозиторий" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };

  await ctx.reply("👋 Привет! Я бот для уведомлений о GitHub коммитах. Выберите опцию:", { reply_markup: replyMarkup });
}

export async function handleHelpCommand(ctx: MyContext) {
  await ctx.reply(
    "📚 Команды:\n" +
    "/start — запуск бота и главное меню\n" +
    "/addrepo — добавить новый репозиторий для отслеживания\n" +
    "/myrepo — показать список всех отслеживаемых репозиториев\n" +
    "/delrepo — удалить отслеживаемый репозиторий\n" +
    "/linkgithub — привязать ваш GitHub никнейм\n" +
    "/unlinkgithub — отвязать ваш GitHub никнейм"
  );
}

export async function handleAddRepoCommand(ctx: MyContext) {
  ctx.session.state = 'awaiting_repo_name';
  await ctx.reply("✏️ Введите полное имя репозитория (пример: `user/my-repo`):", { parse_mode: "Markdown" });
}

export async function handleMyRepoCommand(ctx: MyContext) {
  const { userId } = checkContextIds(ctx);
  if (userId === null) return;

  const user = await getUserWithRepos(userId);

  if (!user || user.repositories.length === 0) {
    return ctx.reply("📭 У вас пока нет отслеживаемых репозиториев.");
  }

  const text = user.repositories
    .map((ru, i) => `🔹 ${i + 1}. [${ru.repository.fullName}](${ru.repository.githubUrl})`)
    .join("\n");

  await ctx.reply(`📦 Ваши репозитории:\n${text}`, { parse_mode: "Markdown" });
}

export async function handleDelRepoCommand(ctx: MyContext) {
  const { userId, chatId } = checkContextIds(ctx);
  if (userId === null || chatId === null) return;

  const user = await getUserWithRepos(userId);

  if (!user || user.repositories.length === 0) {
    return ctx.reply("📭 У вас пока нет репозиториев для удаления.");
  }

  const allUserBindingsInThisChat = await prisma.chatBinding.findMany({
    where: {
      chatId: chatId,
      repositoryId: { in: user.repositories.map(ru => ru.repository.id) }
    },
    include: {
      repository: true
    }
  });

  if (allUserBindingsInThisChat.length === 0) {
    return ctx.reply("📭 В этом чате у вас нет привязанных репозиториев для удаления.");
  }

  const inlineKeyboard = new InlineKeyboard();
  for (const binding of allUserBindingsInThisChat) {
    const threadIdSuffix = binding.threadId !== null ? binding.threadId.toString() : 'null';
    const buttonText = binding.threadId !== null
      ? `${binding.repository.fullName} (Тема: ${binding.repository.name})`
      : `${binding.repository.fullName} (Главный чат)`;

    const button = {
      text: escapeMarkdownForAuthorLink(buttonText),
      callback_data: `select_to_delete_repo_${binding.repository.id}_${threadIdSuffix}`
    };
    inlineKeyboard.row(button);
  }

  const messageThreadId = ctx.message?.message_thread_id;
  await ctx.reply("Выберите репозиторий для удаления:", {
    reply_markup: inlineKeyboard,
    ...(messageThreadId ? { message_thread_id: messageThreadId } : {})
  });
}

export async function handleLinkGithubCommand(ctx: MyContext) {
  ctx.session.state = 'awaiting_github_username';
  await ctx.reply("🔗 Пожалуйста, введите ваш никнейм на GitHub:");
}

export async function handleUnlinkGithubCommand(ctx: MyContext) {
  const { userId } = checkContextIds(ctx);
  if (userId === null) return;

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      select: { githubLogin: true }
    });

    if (!user || !user.githubLogin) {
      return ctx.reply("❌ Ваш аккаунт Telegram не привязан к GitHub.");
    }

    await prisma.user.update({
      where: { telegramId: userId },
      data: { githubLogin: null },
    });
    return ctx.reply("✅ Ваш GitHub никнейм успешно отвязан.");
  } catch (e) {
    console.error("Ошибка отвязки GitHub никнейма:", e);
    return ctx.reply("⚠️ Произошла ошибка при отвязке GitHub никнейма. Пожалуйста, попробуйте позже.");
  }
}

export async function handleTextMessage(ctx: MyContext) {
  const input = ctx.message?.text?.trim();
  if (!input) return;

  if (input === "➕ Добавить репозиторий") {
    return handleAddRepoCommand(ctx);
  }
  if (input === "📋 Мои репозитории") {
    return handleMyRepoCommand(ctx);
  }
  if (input === "❓ Помощь") {
    return handleHelpCommand(ctx);
  }
  if (input === "🔗 Привязать GitHub") {
    return handleLinkGithubCommand(ctx);
  }
  if (input === "🗑️ Отвязать GitHub") {
    return handleUnlinkGithubCommand(ctx);
  }
  if (input === "🤡 Отвязать репозиторий") {
    return handleDelRepoCommand(ctx);
  }

  if (input.startsWith("/")) return;

  const { userId, chatId } = checkContextIds(ctx);
  if (userId === null || chatId === null) return;

  if (ctx.session.state === 'awaiting_github_username') {
    const githubLogin = input;

    if (!githubLogin.match(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/)) {
      return ctx.reply("❌ Неверный формат никнейма GitHub. Используйте только буквы, цифры и дефисы (не в начале/конце).");
    }

    try {
      await prisma.user.update({
        where: { telegramId: userId },
        data: { githubLogin: githubLogin },
      });
      ctx.session.state = undefined;
      return ctx.reply(`✅ Ваш GitHub никнейм *${githubLogin}* успешно привязан!`, { parse_mode: "Markdown" });
    } catch (e: any) {
      console.error("Ошибка привязки GitHub никнейма:", e);
      if (e.message?.includes("Unique constraint failed")) {
        return ctx.reply("⚠️ Этот никнейм GitHub уже привязан к другому аккаунту.");
      }
      return ctx.reply("⚠️ Произошла ошибка при привязке GitHub никнейма. Пожалуйста, попробуйте позже.");
    }
  }

  if (ctx.session.state === 'awaiting_repo_name') {
    ctx.session.state = undefined;
    if (!input.match(/^[\w.-]+\/[\w.-]+$/)) {
      return ctx.reply(
        "❌ Неверный формат имени репозитория. Используйте `пользователь/имя-репозитория` (пример: `octocat/Spoon-Knife`).",
        { parse_mode: "Markdown" }
      );
    }

    const fullName = input;
    const githubUrl = `https://github.com/${fullName}`;
    const name = fullName.split("/").pop()!;

    try {
      let finalThreadId: number | null = null;

      if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
        const messageThreadId = ctx.message?.message_thread_id;
        if (messageThreadId) {
          finalThreadId = messageThreadId;
        } else {
          const existingChatBinding = await prisma.chatBinding.findFirst({
            where: {
              chatId: chatId,
              repository: { fullName: fullName },
              NOT: { threadId: null }
            }
          });

          if (existingChatBinding && existingChatBinding.threadId !== null) {
            finalThreadId = existingChatBinding.threadId;
            const replyToMessageId = ctx.message?.message_id;
            await ctx.reply(
              `Этот репозиторий уже отслеживается в топике: [${escapeMarkdownForAuthorLink(name)}](https://t.me/c/${chatId.toString().substring(4)}/${finalThreadId})`,
              {
                parse_mode: "Markdown",
                ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {})
              }
            );
          } else {
            try {
              const chatInfo = await ctx.api.getChat(Number(chatId));
              if (chatInfo && chatInfo.type === 'supergroup' && chatInfo.is_forum) {
                const topic = await ctx.api.createForumTopic(Number(chatId), name);
                finalThreadId = topic.message_thread_id;
                const replyToMessageId = ctx.message?.message_id;
                await ctx.reply(
                  `📊 Создан топик для репозитория: [${escapeMarkdownForAuthorLink(name)}](https://t.me/c/${chatId.toString().substring(4)}/${finalThreadId})`,
                  {
                    parse_mode: "Markdown",
                    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {})
                  }
                );
              } else {
                await ctx.reply("⚠️ Этот чат не является форумом или бот не может создавать топики. Отслеживание будет вестись в текущем чате.");
                finalThreadId = null;
              }
            } catch (topicError: any) {
              console.warn("Не удалось создать топик форума:", topicError.message);
              await ctx.reply("⚠️ Не удалось создать отдельный топик форума для репозитория. Отслеживание будет вестись в текущем чате.");
              finalThreadId = null;
            }
          }
        }
      }

      const repo = await prisma.repository.upsert({
        where: { fullName },
        update: { name, githubUrl },
        create: { name, fullName, githubUrl },
      });

      await prisma.chatBinding.upsert({
        where: {
          repositoryId_chatId: {
            repositoryId: repo.id,
            chatId: chatId,
          }
        },
        update: { threadId: finalThreadId },
        create: { repositoryId: repo.id, chatId, threadId: finalThreadId },
      });

      const user = await getUserWithRepos(userId);
      if (user) {
        await prisma.repositoryUser.upsert({
          where: { userId_repositoryId: { userId: user.id, repositoryId: repo.id } },
          update: {},
          create: { userId: user.id, repositoryId: repo.id },
        });
      }

      await ctx.reply(`✅ Репозиторий *${escapeMarkdownForAuthorLink(fullName)}* добавлен и отслеживается!`, { parse_mode: "Markdown" });
    } catch (error: any) {
      console.error("Ошибка добавления репозитория:", error);
      if (error.code === 'P2002' && error.meta?.target) {
        if (Array.isArray(error.meta.target) && error.meta.target.includes('repositoryId') && error.meta.target.includes('chatId')) {
          await ctx.reply("⚠️ Репозиторий уже добавлен в этот чат (и тему, если применимо).");
        } else {
          await ctx.reply(`⚠️ Произошла ошибка с уникальным ограничением: ${error.message}`);
        }
      } else {
        await ctx.reply("⚠️ Не удалось добавить репозиторий. Пожалуйста, попробуйте позже.");
      }
    }
  } else {
    await ctx.reply("Неизвестная команда или ввод. Используйте кнопки меню или команды.");
  }
}