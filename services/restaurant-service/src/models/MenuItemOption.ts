import pool from "../db/connection";

export interface OptionGroupRow {
  id: string;
  menu_item_id: string;
  name: string;
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface OptionRow {
  id: string;
  group_id: string;
  name: string;
  additional_price: string;
  is_available: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface OptionGroupWithOptions extends OptionGroupRow {
  options: OptionRow[];
}

export async function listGroupsByItemId(menuItemId: string): Promise<OptionGroupWithOptions[]> {
  const groupsResult = await pool.query<OptionGroupRow>(
    `SELECT * FROM restaurant.menu_item_option_groups
     WHERE menu_item_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [menuItemId]
  );
  if (groupsResult.rows.length === 0) return [];

  const groupIds = groupsResult.rows.map((g) => g.id);
  const optionsResult = await pool.query<OptionRow>(
    `SELECT * FROM restaurant.menu_item_options
     WHERE group_id = ANY($1::uuid[])
     ORDER BY display_order ASC, created_at ASC`,
    [groupIds]
  );

  const optionsByGroup = new Map<string, OptionRow[]>();
  for (const opt of optionsResult.rows) {
    const arr = optionsByGroup.get(opt.group_id) ?? [];
    arr.push(opt);
    optionsByGroup.set(opt.group_id, arr);
  }

  return groupsResult.rows.map((g) => ({
    ...g,
    options: optionsByGroup.get(g.id) ?? [],
  }));
}

export async function listGroupsByItemIds(
  menuItemIds: string[]
): Promise<Map<string, OptionGroupWithOptions[]>> {
  if (menuItemIds.length === 0) return new Map();

  const groupsResult = await pool.query<OptionGroupRow>(
    `SELECT * FROM restaurant.menu_item_option_groups
     WHERE menu_item_id = ANY($1::uuid[])
     ORDER BY display_order ASC, created_at ASC`,
    [menuItemIds]
  );
  if (groupsResult.rows.length === 0) return new Map();

  const groupIds = groupsResult.rows.map((g) => g.id);
  const optionsResult = await pool.query<OptionRow>(
    `SELECT * FROM restaurant.menu_item_options
     WHERE group_id = ANY($1::uuid[])
     ORDER BY display_order ASC, created_at ASC`,
    [groupIds]
  );

  const optionsByGroup = new Map<string, OptionRow[]>();
  for (const opt of optionsResult.rows) {
    const arr = optionsByGroup.get(opt.group_id) ?? [];
    arr.push(opt);
    optionsByGroup.set(opt.group_id, arr);
  }

  const groupsByItem = new Map<string, OptionGroupWithOptions[]>();
  for (const g of groupsResult.rows) {
    const arr = groupsByItem.get(g.menu_item_id) ?? [];
    arr.push({ ...g, options: optionsByGroup.get(g.id) ?? [] });
    groupsByItem.set(g.menu_item_id, arr);
  }

  return groupsByItem;
}

export async function findGroupById(id: string): Promise<OptionGroupRow | null> {
  const r = await pool.query<OptionGroupRow>(
    "SELECT * FROM restaurant.menu_item_option_groups WHERE id = $1",
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createGroup(params: {
  menu_item_id: string;
  name: string;
  is_required?: boolean;
  min_selections?: number;
  max_selections?: number;
  display_order?: number;
}): Promise<OptionGroupRow> {
  const r = await pool.query<OptionGroupRow>(
    `INSERT INTO restaurant.menu_item_option_groups
       (menu_item_id, name, is_required, min_selections, max_selections, display_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.menu_item_id,
      params.name,
      params.is_required ?? false,
      params.min_selections ?? 0,
      params.max_selections ?? 1,
      params.display_order ?? 0,
    ]
  );
  return r.rows[0];
}

export async function updateGroup(
  id: string,
  params: {
    name?: string;
    is_required?: boolean;
    min_selections?: number;
    max_selections?: number;
    display_order?: number;
  }
): Promise<OptionGroupRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.name !== undefined) { updates.push(`name = $${i++}`); values.push(params.name); }
  if (params.is_required !== undefined) { updates.push(`is_required = $${i++}`); values.push(params.is_required); }
  if (params.min_selections !== undefined) { updates.push(`min_selections = $${i++}`); values.push(params.min_selections); }
  if (params.max_selections !== undefined) { updates.push(`max_selections = $${i++}`); values.push(params.max_selections); }
  if (params.display_order !== undefined) { updates.push(`display_order = $${i++}`); values.push(params.display_order); }
  if (updates.length === 0) return findGroupById(id);
  values.push(id);
  const r = await pool.query<OptionGroupRow>(
    `UPDATE restaurant.menu_item_option_groups SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ?? null;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM restaurant.menu_item_option_groups WHERE id = $1",
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function findOptionById(id: string): Promise<OptionRow | null> {
  const r = await pool.query<OptionRow>(
    "SELECT * FROM restaurant.menu_item_options WHERE id = $1",
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createOption(params: {
  group_id: string;
  name: string;
  additional_price?: number;
  is_available?: boolean;
  display_order?: number;
}): Promise<OptionRow> {
  const r = await pool.query<OptionRow>(
    `INSERT INTO restaurant.menu_item_options
       (group_id, name, additional_price, is_available, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.group_id,
      params.name,
      params.additional_price ?? 0,
      params.is_available !== undefined ? params.is_available : true,
      params.display_order ?? 0,
    ]
  );
  return r.rows[0];
}

export async function updateOption(
  id: string,
  params: {
    name?: string;
    additional_price?: number;
    is_available?: boolean;
    display_order?: number;
  }
): Promise<OptionRow | null> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (params.name !== undefined) { updates.push(`name = $${i++}`); values.push(params.name); }
  if (params.additional_price !== undefined) { updates.push(`additional_price = $${i++}`); values.push(params.additional_price); }
  if (params.is_available !== undefined) { updates.push(`is_available = $${i++}`); values.push(params.is_available); }
  if (params.display_order !== undefined) { updates.push(`display_order = $${i++}`); values.push(params.display_order); }
  if (updates.length === 0) return findOptionById(id);
  values.push(id);
  const r = await pool.query<OptionRow>(
    `UPDATE restaurant.menu_item_options SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return r.rows[0] ?? null;
}

export async function deleteOption(id: string): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM restaurant.menu_item_options WHERE id = $1",
    [id]
  );
  return (r.rowCount ?? 0) > 0;
}

export function groupToResponse(group: OptionGroupWithOptions): Record<string, unknown> {
  return {
    id: group.id,
    menu_item_id: group.menu_item_id,
    name: group.name,
    is_required: group.is_required,
    min_selections: group.min_selections,
    max_selections: group.max_selections,
    display_order: group.display_order,
    options: group.options.map(optionToResponse),
  };
}

export function optionToResponse(opt: OptionRow): Record<string, unknown> {
  return {
    id: opt.id,
    group_id: opt.group_id,
    name: opt.name,
    additional_price: parseFloat(opt.additional_price),
    is_available: opt.is_available,
    display_order: opt.display_order,
  };
}
