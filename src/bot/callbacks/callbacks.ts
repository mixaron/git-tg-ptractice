import { InlineKeyboard } from "grammy";
import { PrismaClient } from "@prisma/client";
import { MyContext } from "../types/types";
import { escapeMarkdownForAuthorLink, checkContextIds } from "../utils/utils"; // Убедитесь, что пути правильные

const prisma = new PrismaClient();

/**
 * Обрабатывает колбэк выбора репозитория для удаления.
 * Формирует и отправляет сообщение с подтверждением удаления.
 * @param ctx Контекст сообщения.
 */
export async function handleDeleteRepoCallback(ctx: MyContext) {
    await ctx.answerCallbackQuery(); // Отвечаем на колбэк, чтобы убрать "часики"

    // Извлекаем repoId и threadId из callback_data
    const repoId = parseInt(ctx.match![1]);
    const threadIdFromCallback = ctx.match![2] === 'null' ? null : parseInt(ctx.match![2]);

    if (isNaN(repoId)) {
        return ctx.reply("⚠️ Ошибка: неверный ID репозитория.");
    }

    try {
        const repoToDelete = await prisma.repository.findUnique({ where: { id: repoId } });
        if (!repoToDelete) {
            return ctx.reply("Репозиторий не найден.");
        }

        // Формируем кнопки подтверждения/отмены, передавая repoId и threadId обратно
        const confirmationKeyboard = new InlineKeyboard()
            .text("✅ Да, удалить", `confirm_delete_${repoId}_${threadIdFromCallback ?? 'null'}`)
            .text("❌ Нет, отмена", `cancel_delete_${repoId}_${threadIdFromCallback ?? 'null'}`);

        // Формируем текст сообщения для подтверждения
        let text = `Вы уверены, что хотите удалить репозиторий *${escapeMarkdownForAuthorLink(repoToDelete.fullName)}*`;
        if (threadIdFromCallback !== null) {
            text += ` (Тема: ${escapeMarkdownForAuthorLink(repoToDelete.name)})`;
        }
        text += '?';

        // Пытаемся отредактировать сообщение. Обрабатываем ошибку, если сообщение не изменилось.
        try {
            await ctx.editMessageText(text, {
                reply_markup: confirmationKeyboard,
                parse_mode: "Markdown",
            });
        } catch (e: any) {
            if (e.description?.includes("message is not modified")) {
                console.warn("⚠️ editMessageText: сообщение не изменилось, ошибка проигнорирована.");
            } else {
                throw e; // Пробрасываем другие ошибки редактирования сообщения
            }
        }

    } catch (e) {
        console.error("Ошибка при подготовке к удалению:", e);
        await ctx.reply("⚠️ Произошла ошибка при подготовке к удалению.");
    }
}

/**
 * Обрабатывает колбэк подтверждения удаления репозитория.
 * Выполняет удаление привязки, темы и, возможно, самого репозитория из БД.
 * @param ctx Контекст сообщения.
 */
export async function handleConfirmDeleteCallback(ctx: MyContext) {
    await ctx.answerCallbackQuery("Удаляем репозиторий..."); // Отвечаем на колбэк
    
    // Извлекаем repoId и threadId из callback_data
    const repoId = parseInt(ctx.match![1]);
    const threadIdFromCallback = ctx.match![2] === 'null' ? null : parseInt(ctx.match![2]);

    const { userId, chatId } = checkContextIds(ctx); // Проверяем ID пользователя и чата

    if (isNaN(repoId) || userId === null || chatId === null) {
        return; // Возвращаемся, если данные невалидны
    }

    let finalUserMessage = ""; // Строим итоговое сообщение для пользователя

    try {
        const user = await prisma.user.findUnique({ where: { telegramId: userId } });
        if (!user) {
            await ctx.reply("Пользователь не найден в системе.");
            return;
        }

        // Находим привязку для удаления (используем repoId, chatId и threadIdFromCallback для точности)
        const bindingToRemove = await prisma.chatBinding.findFirst({
            where: {
                repositoryId: repoId,
                chatId: chatId,
                threadId: threadIdFromCallback,
            },
            include: {
                repository: true // Включаем репозиторий для получения его полного имени
            }
        });

        if (!bindingToRemove) {
            // Если привязка не найдена, возможно, она уже была удалена
            const replyToMessageId = ctx.callbackQuery?.message?.message_id;
            await ctx.reply(
                "Привязка репозитория к этому чату/теме не найдена или уже удалена.",
                replyToMessageId ? { reply_to_message_id: replyToMessageId } : undefined
            );
            return;
        }

        const repoFullName = bindingToRemove.repository.fullName;
        const repoName = bindingToRemove.repository.name; // Для названия темы

        // 1. Удаляем конкретную привязку ChatBinding
        // Поскольку @@unique([repositoryId, chatId]), мы удаляем единственную запись для этой пары.
        // Добавление threadId в условие where тут необязательно, но помогает быть более точным,
        // если в будущем схема изменится или если это поможет с отладкой.
        await prisma.chatBinding.deleteMany({
            where: {
                repositoryId: repoId,
                chatId: chatId,
                threadId: threadIdFromCallback, 
            },
        });

        // 2. Логика удаления темы форума (если это была тема)
        if (threadIdFromCallback !== null) { // Если удаляемая привязка была к топику
            // Проверяем, остались ли ещё привязки этого репозитория к этому же чату (в других топиках или в общем)
            // C вашей текущей схемой `@@unique([repositoryId, chatId])`
            // `remainingBindingsInThisChat` будет 0 после удаления единственной привязки для `(repoId, chatId)`
            // Поэтому, если `threadIdFromCallback !== null`, тема должна быть удалена.
            const remainingBindingsInThisChat = await prisma.chatBinding.count({
                where: {
                    repositoryId: repoId,
                    chatId: chatId,
                }
            });

            if (remainingBindingsInThisChat === 0) {
                try {
                    await ctx.api.deleteForumTopic(Number(chatId), Number(threadIdFromCallback));
                    finalUserMessage += `🗑️ Тема для репозитория *${escapeMarkdownForAuthorLink(repoName)}* удалена.\n`;
                } catch (topicDeleteError: any) {
                    console.error(`Ошибка при удалении темы ${threadIdFromCallback} для репозитория ${repoId} в чате ${chatId}:`, topicDeleteError);
                    if (topicDeleteError.description?.includes('not enough rights to manage topics')) {
                        finalUserMessage += "⚠️ Не удалось удалить тему форума: у бота недостаточно прав. Пожалуйста, выдайте боту разрешение 'Управлять темами'.\n";
                    } else if (topicDeleteError.description?.includes('thread not found')) {
                        finalUserMessage += "⚠️ Не удалось удалить тему форума: тема не найдена. Возможно, она уже удалена.\n";
                    } else {
                        finalUserMessage += "⚠️ Не удалось удалить соответствующую тему форума. Пожалуйста, проверьте логи бота.\n";
                    }
                }
            } else {
                // Этот блок кода с вашей текущей схемой `@@unique([repositoryId, chatId])` в ChatBinding
                // не должен быть достигнут, так как `remainingBindingsInThisChat` всегда будет 0.
                // Если он достигнут, это может указывать на проблему с вашей миграцией или уникальностью.
                finalUserMessage += `Привязка репозитория *${escapeMarkdownForAuthorLink(repoFullName)}* к этой теме удалена. Но тема не была удалена, так как репозиторий все еще отслеживается в других местах этого чата.\n`;
            }
        } else {
            // Если привязка была к главному чату (threadIdFromCallback === null)
            finalUserMessage += `✅ Привязка репозитория *${escapeMarkdownForAuthorLink(repoFullName)}* к основному чату удалена.\n`;
            finalUserMessage += `_Темы форума не удаляются, если привязка была к основному чату._\n`;
        }

        // 3. Логика полного удаления репозитория из БД (если он нигде больше не отслеживается)
        const totalRemainingChatBindingsForRepo = await prisma.chatBinding.count({
            where: {
                repositoryId: repoId,
            }
        });

        if (totalRemainingChatBindingsForRepo === 0) {
            // Если привязок к чатам не осталось совсем, удаляем все связанные записи и сам репозиторий
            await prisma.repositoryUser.deleteMany({
                where: { repositoryId: repoId }
            });
            await prisma.repository.delete({
                where: { id: repoId }
            });
            console.log(`Репозиторий ${repoFullName} (${repoId}) полностью удален из БД, так как не имеет активных привязок к чатам.`);
            finalUserMessage += `\n✅ Репозиторий *${escapeMarkdownForAuthorLink(repoFullName)}* полностью удален из системы.`;
        } else {
            // Если репозиторий все еще привязан к другим чатам (не полное удаление)
            // Добавляем сообщение, если оно еще не было добавлено в предыдущих шагах
            if (finalUserMessage === "") { 
                 finalUserMessage = `✅ Привязка репозитория *${escapeMarkdownForAuthorLink(repoFullName)}* удалена из этого чата.\n`;
            }
            finalUserMessage += `\n_Репозиторий *${escapeMarkdownForAuthorLink(repoFullName)}* все еще отслеживается в других чатах._`;
        }

        // Отправляем итоговое сообщение пользователю
        await ctx.editMessageText(finalUserMessage.trim(), { parse_mode: "Markdown" });

    } catch (e: any) {
        console.error("Ошибка при удалении репозитория:", e);
        await ctx.reply("⚠️ Не удалось удалить репозиторий. Пожалуйста, попробуйте позже.");
    }
}

/**
 * Обрабатывает колбэк отмены удаления репозитория.
 * @param ctx Контекст сообщения.
 */
export async function handleCancelDeleteCallback(ctx: MyContext) {
    await ctx.answerCallbackQuery("Удаление отменено."); // Отвечаем на колбэк

    // Извлекаем repoId и threadId из callback_data
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

        // Редактируем сообщение об отмене
        await ctx.editMessageText(messageText, { parse_mode: "Markdown" });
    } catch (e) {
        console.error("Ошибка при отмене удаления:", e);
        await ctx.reply("⚠️ Ошибка при отмене.");
    }
}
