import pool from "../db/connection";

interface UserAddressRow {
  id: string;
  user_id: string;
  complete_address: string;
  category: string;
  landmark: string | null;
  location_details: string | null;
  latitude: string | null;
  longitude: string | null;
}

export async function findUserAddressById(
  addressId: string,
  userId: string
): Promise<UserAddressRow | null> {
  const r = await pool.query<UserAddressRow>(
    `SELECT id, user_id, complete_address, category, landmark, location_details, latitude, longitude
     FROM auth.user_addresses
     WHERE id = $1 AND user_id = $2`,
    [addressId, userId]
  );
  return r.rows[0] ?? null;
}

export function snapshotFromUserAddressRow(row: UserAddressRow): Record<string, unknown> {
  const latRaw = row.latitude;
  const lngRaw = row.longitude;
  const lat =
    latRaw != null && String(latRaw).trim() !== "" ? parseFloat(String(latRaw)) : null;
  const lng =
    lngRaw != null && String(lngRaw).trim() !== "" ? parseFloat(String(lngRaw)) : null;
  return {
    address_id: row.id,
    complete_address: row.complete_address,
    category: row.category,
    landmark: row.landmark,
    location_details: row.location_details,
    latitude: lat,
    longitude: lng,
    lat,
    lng,
  };
}

export async function deliveryAddressForOrderResponse(order: {
  delivery_address_id: string | null;
  user_id: string;
}): Promise<Record<string, unknown> | null> {
  if (!order.delivery_address_id) return null;
  const row = await findUserAddressById(order.delivery_address_id, order.user_id);
  if (row) return snapshotFromUserAddressRow(row);
  return { address_id: order.delivery_address_id };
}
