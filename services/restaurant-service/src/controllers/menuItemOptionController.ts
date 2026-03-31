import { Response } from "express";
import * as MenuItem from "../models/MenuItem";
import * as MenuItemOption from "../models/MenuItemOption";
import { AuthRequest } from "../middleware/auth";

async function resolveMenuItemForOwner(
  req: AuthRequest,
  res: Response,
  menuItemId: string
): Promise<boolean> {
  const item = await MenuItem.findById(menuItemId);
  if (!item) {
    res.status(404).json({ success: false, status: "ERROR", message: "Menu item not found", data: null });
    return false;
  }
  // Admin can manage any item; restaurant owner must own it
  if (req.user?.role === "restaurant") {
    const { pool } = await import("../db/connection").then((m) => ({ pool: m.default }));
    const r = await pool.query(
      "SELECT id FROM restaurant.restaurants WHERE id = $1 AND user_id = $2",
      [item.restaurant_id, req.user.id]
    );
    if (r.rows.length === 0) {
      res.status(403).json({ success: false, status: "ERROR", message: "You do not own this menu item", data: null });
      return false;
    }
  }
  return true;
}

export async function listGroups(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const groups = await MenuItemOption.listGroupsByItemId(menuItemId);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Option groups listed",
      data: { option_groups: groups.map(MenuItemOption.groupToResponse) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to list option groups", data: null });
  }
}

export async function createGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ success: false, status: "ERROR", message: "name is required", data: null });
      return;
    }
    const isRequired = typeof body.is_required === "boolean" ? body.is_required : false;
    const minSelections = typeof body.min_selections === "number" ? body.min_selections : 0;
    const maxSelections = typeof body.max_selections === "number" ? body.max_selections : 1;
    const displayOrder = typeof body.display_order === "number" ? body.display_order : 0;

    if (minSelections < 0 || maxSelections < 1 || minSelections > maxSelections) {
      res.status(400).json({ success: false, status: "ERROR", message: "Invalid min_selections / max_selections values", data: null });
      return;
    }

    const group = await MenuItemOption.createGroup({
      menu_item_id: menuItemId,
      name,
      is_required: isRequired,
      min_selections: minSelections,
      max_selections: maxSelections,
      display_order: displayOrder,
    });

    const withOptions = { ...group, options: [] };
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Option group created",
      data: { option_group: MenuItemOption.groupToResponse(withOptions) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to create option group", data: null });
  }
}

export async function updateGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    const groupId = req.params.groupId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const existing = await MenuItemOption.findGroupById(groupId);
    if (!existing || existing.menu_item_id !== menuItemId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const params: Parameters<typeof MenuItemOption.updateGroup>[1] = {};
    if (typeof body.name === "string") params.name = body.name.trim();
    if (typeof body.is_required === "boolean") params.is_required = body.is_required;
    if (typeof body.min_selections === "number") params.min_selections = body.min_selections;
    if (typeof body.max_selections === "number") params.max_selections = body.max_selections;
    if (typeof body.display_order === "number") params.display_order = body.display_order;

    const updated = await MenuItemOption.updateGroup(groupId, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }

    const groups = await MenuItemOption.listGroupsByItemId(menuItemId);
    const updatedWithOptions = groups.find((g) => g.id === groupId);
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Option group updated",
      data: { option_group: MenuItemOption.groupToResponse(updatedWithOptions ?? { ...updated, options: [] }) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to update option group", data: null });
  }
}

export async function deleteGroup(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    const groupId = req.params.groupId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const existing = await MenuItemOption.findGroupById(groupId);
    if (!existing || existing.menu_item_id !== menuItemId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }

    await MenuItemOption.deleteGroup(groupId);
    res.status(200).json({ success: true, status: "OK", message: "Option group deleted", data: null });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to delete option group", data: null });
  }
}

export async function createOption(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    const groupId = req.params.groupId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const group = await MenuItemOption.findGroupById(groupId);
    if (!group || group.menu_item_id !== menuItemId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      res.status(400).json({ success: false, status: "ERROR", message: "name is required", data: null });
      return;
    }
    const additionalPrice = typeof body.additional_price === "number" ? body.additional_price : 0;
    const isAvailable = typeof body.is_available === "boolean" ? body.is_available : true;
    const displayOrder = typeof body.display_order === "number" ? body.display_order : 0;

    const option = await MenuItemOption.createOption({ group_id: groupId, name, additional_price: additionalPrice, is_available: isAvailable, display_order: displayOrder });
    res.status(201).json({
      success: true,
      status: "OK",
      message: "Option created",
      data: { option: MenuItemOption.optionToResponse(option) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to create option", data: null });
  }
}

export async function updateOption(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    const groupId = req.params.groupId;
    const optionId = req.params.optionId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const group = await MenuItemOption.findGroupById(groupId);
    if (!group || group.menu_item_id !== menuItemId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }
    const existing = await MenuItemOption.findOptionById(optionId);
    if (!existing || existing.group_id !== groupId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option not found", data: null });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const params: Parameters<typeof MenuItemOption.updateOption>[1] = {};
    if (typeof body.name === "string") params.name = body.name.trim();
    if (typeof body.additional_price === "number") params.additional_price = body.additional_price;
    if (typeof body.is_available === "boolean") params.is_available = body.is_available;
    if (typeof body.display_order === "number") params.display_order = body.display_order;

    const updated = await MenuItemOption.updateOption(optionId, params);
    if (!updated) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option not found", data: null });
      return;
    }
    res.status(200).json({
      success: true,
      status: "OK",
      message: "Option updated",
      data: { option: MenuItemOption.optionToResponse(updated) },
    });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to update option", data: null });
  }
}

export async function deleteOption(req: AuthRequest, res: Response): Promise<void> {
  try {
    const menuItemId = req.params.itemId;
    const groupId = req.params.groupId;
    const optionId = req.params.optionId;
    if (!(await resolveMenuItemForOwner(req, res, menuItemId))) return;

    const group = await MenuItemOption.findGroupById(groupId);
    if (!group || group.menu_item_id !== menuItemId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option group not found", data: null });
      return;
    }
    const existing = await MenuItemOption.findOptionById(optionId);
    if (!existing || existing.group_id !== groupId) {
      res.status(404).json({ success: false, status: "ERROR", message: "Option not found", data: null });
      return;
    }

    await MenuItemOption.deleteOption(optionId);
    res.status(200).json({ success: true, status: "OK", message: "Option deleted", data: null });
  } catch (err) {
    res.status(500).json({ success: false, status: "ERROR", message: err instanceof Error ? err.message : "Failed to delete option", data: null });
  }
}
