import type { Admin } from "../validation/types";

export const SHOPIFY_PLAN_QUERY = `#graphql
  query OwnerShopifyPlan {
    shop {
      plan {
        publicDisplayName
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
  try {
    const admin = await adminForShop(shopDomain);
    const response = await admin.graphql(SHOPIFY_PLAN_QUERY);
    const payload = (await response.json()) as {
      data?: { shop?: { plan?: { publicDisplayName?: unknown } } };
      errors?: unknown[];
    };
    const value = payload.data?.shop?.plan?.publicDisplayName;
    return response.ok && !payload.errors?.length && typeof value === "string" && value.trim()
      ? value.trim()
      : null;
  } catch {
    return null;
  }
}
