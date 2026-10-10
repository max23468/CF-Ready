import type { Admin } from "../validation/types";

export const SHOPIFY_PLAN_QUERY = `#graphql
  query OwnerShopifyPlan {
    shop {
      plan {
        publicDisplayName
        partnerDevelopment
      }
    }
  }
`;

export type ShopifyAdminForShop = (shopDomain: string) => Promise<Admin>;

export type ShopifyPlanShop = {
  id: number;
  shop_domain: string;
  installation_status: string;
};

export type ShopifyPlanRow = {
  shopId: number;
  plan: string | null;
};

export function readShopifyPlans(shops: ShopifyPlanShop[], adminForShop: ShopifyAdminForShop) {
  return Promise.all(
    shops.map(async (shop): Promise<ShopifyPlanRow> => ({
      shopId: shop.id,
      plan:
        shop.installation_status === "active"
          ? await readShopifyPlan(shop.shop_domain, adminForShop)
          : null,
    })),
  );
}

export async function readShopifyPlan(
  shopDomain: string,
  adminForShop: ShopifyAdminForShop,
): Promise<string | null> {
  return (await readShopifyPlanDetails(shopDomain, adminForShop))?.name ?? null;
}

export async function readShopifyPlanDetails(
  shopDomain: string,
  adminForShop: ShopifyAdminForShop,
): Promise<{ name: string; partnerDevelopment: boolean | null } | null> {
  try {
    const admin = await adminForShop(shopDomain);
    const response = await admin.graphql(SHOPIFY_PLAN_QUERY);
    const payload = (await response.json()) as {
      data?: { shop?: { plan?: { publicDisplayName?: unknown; partnerDevelopment?: unknown } } };
      errors?: unknown[];
    };
    const value = payload.data?.shop?.plan?.publicDisplayName;
    return response.ok && !payload.errors?.length && typeof value === "string" && value.trim()
      ? {
          name: value.trim(),
          partnerDevelopment:
            typeof payload.data?.shop?.plan?.partnerDevelopment === "boolean"
              ? payload.data.shop.plan.partnerDevelopment
              : null,
        }
      : null;
  } catch {
    return null;
  }
}
