import { isRecord } from "../primitives";
import { parseCallback, parseCommand, type OwnerControlAction } from "./actions";

export type OwnerControlUpdate =
  | {
      kind: "message";
      updateId: number;
      action: OwnerControlAction;
    }
  | {
      kind: "callback_query";
      updateId: number;
      action: OwnerControlAction;
      callbackQueryId: string;
      messageId: number;
    };

type ParsedOwnerControlUpdate =
  | { result: "accepted"; update: OwnerControlUpdate }
  | { result: "ignored"; callbackQueryId?: string }
  | { result: "unauthorized" }
  | { result: "invalid" };

type OwnerIdentity = { chatId: string; userId: string };

export function parseOwnerControlUpdate(
  payload: unknown,
  owner: OwnerIdentity,
): ParsedOwnerControlUpdate {
  if (!isRecord(payload) || !isSafeId(payload.update_id)) return { result: "invalid" };

  const hasMessage = payload.message !== undefined;
  const hasCallback = payload.callback_query !== undefined;
  if (hasMessage === hasCallback) return hasMessage ? { result: "invalid" } : { result: "ignored" };

  if (hasMessage) {
    const message = payload.message;
    if (!isRecord(message) || !isAuthorizedMessage(message, owner)) {
      return isRecord(message) ? { result: "unauthorized" } : { result: "invalid" };
    }
    if (typeof message.text !== "string") return { result: "ignored" };
    const action = parseCommand(message.text);
    return action
      ? { result: "accepted", update: { kind: "message", updateId: payload.update_id, action } }
      : { result: "ignored" };
  }

  const callback = payload.callback_query;
  if (!isRecord(callback) || typeof callback.id !== "string" || callback.id.length > 256) {
    return { result: "invalid" };
  }
  if (!isSafeId(callback.from && isRecord(callback.from) ? callback.from.id : undefined)) {
    return { result: "invalid" };
  }
  const message = callback.message;
  if (!isRecord(message) || !isAuthorizedChat(message, owner.chatId)) {
    return isRecord(message) ? { result: "unauthorized" } : { result: "invalid" };
  }
  if (String((callback.from as Record<string, unknown>).id) !== owner.userId) {
    return { result: "unauthorized" };
  }
  if (!isSafeId(message.message_id)) return { result: "invalid" };
  if (typeof callback.data !== "string") {
    return { result: "ignored", callbackQueryId: callback.id };
  }
  const action = parseCallback(callback.data);
  return action
    ? {
        result: "accepted",
        update: {
          kind: "callback_query",
          updateId: payload.update_id,
          action,
          callbackQueryId: callback.id,
          messageId: message.message_id,
        },
      }
    : { result: "ignored", callbackQueryId: callback.id };
}

function isAuthorizedMessage(message: Record<string, unknown>, owner: OwnerIdentity) {
  const from = message.from;
  return (
    isAuthorizedChat(message, owner.chatId) &&
    isRecord(from) &&
    isSafeId(from.id) &&
    String(from.id) === owner.userId
  );
}

function isAuthorizedChat(message: Record<string, unknown>, chatId: string) {
  const chat = message.chat;
  return (
    isRecord(chat) && chat.type === "private" && isSafeId(chat.id) && String(chat.id) === chatId
  );
}

function isSafeId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
