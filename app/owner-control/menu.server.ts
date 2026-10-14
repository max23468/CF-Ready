import menuCommands from "../../config/telegram-owner-menu.json";
import {
  createTelegramClient,
  type TelegramBotCommand,
  type TelegramClientConfig,
} from "../telegram/client.server";

export const OWNER_CONTROL_MENU_COMMANDS: readonly TelegramBotCommand[] = menuCommands;

// Scrive soltanto quando il menu della chat owner diverge dal codice: un nuovo comando
// compare dopo il deploy senza passaggi manuali (D-190).
export async function syncOwnerControlMenu(
  config: TelegramClientConfig,
  fetcher: typeof fetch = fetch,
) {
  const client = createTelegramClient(config, fetcher);
  const current = await client.getMyCommands();
  if (JSON.stringify(current) === JSON.stringify(OWNER_CONTROL_MENU_COMMANDS)) return "aligned";
  await client.setMyCommands(OWNER_CONTROL_MENU_COMMANDS);
  return "updated";
}
