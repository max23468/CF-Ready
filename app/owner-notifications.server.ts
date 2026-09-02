import { pollLocalAppEvents } from "./owner-notifications/local-app-source.server";
import { pollLocalBillingEvents } from "./owner-notifications/local-billing-source.server";

export { deliverOwnerNotifications } from "./owner-notifications/delivery.server";
export { pollPartnerEvents } from "./owner-notifications/partner-source.server";

export async function pollLocalNotifications(db: D1Database, now = new Date()) {
  const local = await pollLocalAppEvents(db, now);
  // Il bootstrap billing usa l'istante della prima riga outbox, che il poll locale può avere
  // appena creato: l'ordine evita di escludere transizioni precedenti al primo ciclo completo.
  // react-doctor-disable-next-line react-doctor/server-sequential-independent-await
  const billing = await pollLocalBillingEvents(db, now);
  return {
    inserted: local.inserted + billing.inserted,
    pages: local.pages + billing.pages,
    localAfterId: local.afterId,
    billingAfterId: billing.afterId,
  };
}
