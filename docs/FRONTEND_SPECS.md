# Frontend Implementation Specs

This document contains detailed frontend specifications for features across the Hassa platform. Each section covers UX flow, API contracts, component breakdown, and edge cases — ready to hand to a frontend developer or agent.

---

## Table of Contents

1. [Options & Add-ons (Restaurant Dashboard)](#1-options--add-ons-restaurant-dashboard)

---

## 1. Options & Add-ons (Restaurant Dashboard)

### Overview

Every menu item can have **option groups**. Each group contains individual **options**. This covers both "pick one" scenarios (size) and "pick many" scenarios (add-ons). There is no separate concept — both are the same system configured differently via `min_selections` and `max_selections`.

The frontend needs to handle this in two places:
1. **Menu Item Form** — when creating or editing a menu item
2. **Option Group Manager** — a dedicated section within the menu item detail view

---

### 1.1 Where to Place the UI

**Do NOT put option groups inside the "Create Menu Item" modal/form.**

The correct approach:

```
Step 1: Create the menu item first (name, price, image, category)
          ↓
Step 2: After creation, open the "Edit Menu Item" page/drawer
          ↓
Step 3: A section at the bottom called "Options & Add-ons"
        shows all groups for this item with full CRUD
```

**Why:** Option groups are complex (each has multiple options). Adding them during creation overloads the form. The restaurant owner first creates the item, then configures its customizations separately — same as Uber Eats, Foodpanda, and Talabat dashboards.

---

### 1.2 Edit Menu Item Page Layout

```
┌─────────────────────────────────────────────┐
│  ← Back        Edit Menu Item               │
├─────────────────────────────────────────────┤
│  Basic Info                                 │
│  ┌──────────────────────────────────────┐   │
│  │ Name, Price, Description, Image      │   │
│  │ Category, Availability               │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  Options & Add-ons              [+ Add Group]│
│  ┌──────────────────────────────────────┐   │
│  │ 🟦 Choose Size          [Edit] [🗑]  │   │
│  │    Required · Pick exactly 1         │   │
│  │    • Regular    +0                   │   │
│  │    • Large      +IQD 500             │   │
│  │                        [+ Add Option]│   │
│  ├──────────────────────────────────────┤   │
│  │ 🟩 Add-ons              [Edit] [🗑]  │   │
│  │    Optional · Pick up to 3           │   │
│  │    • Extra Cheese  +IQD 250          │   │
│  │    • Bacon         +IQD 500          │   │
│  │                        [+ Add Option]│   │
│  └──────────────────────────────────────┘   │
│                              [Save Changes] │
└─────────────────────────────────────────────┘
```

---

### 1.3 All API Calls

**Base URL:** `{{base_url}}/api/restaurants`  
**Auth header on all requests:** `Authorization: Bearer {{token}}`

---

#### Load option groups when Edit page opens

```
GET /menu-items/:itemId/option-groups
```

**Response:**
```json
{
  "success": true,
  "data": {
    "option_groups": [
      {
        "id": "uuid-group-1",
        "menu_item_id": "uuid-item",
        "name": "Choose Size",
        "is_required": true,
        "min_selections": 1,
        "max_selections": 1,
        "display_order": 0,
        "options": [
          {
            "id": "uuid-opt-1",
            "group_id": "uuid-group-1",
            "name": "Regular",
            "additional_price": 0,
            "is_available": true,
            "display_order": 0
          },
          {
            "id": "uuid-opt-2",
            "group_id": "uuid-group-1",
            "name": "Large",
            "additional_price": 500,
            "is_available": true,
            "display_order": 1
          }
        ]
      }
    ]
  }
}
```

---

#### Create a new option group

```
POST /menu-items/:itemId/option-groups
Content-Type: application/json
```

**Request body:**
```json
{
  "name": "Choose Size",
  "is_required": true,
  "min_selections": 1,
  "max_selections": 1,
  "display_order": 0
}
```

**Field rules:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Group label shown to customer |
| `is_required` | boolean | no | Default `false` |
| `min_selections` | integer | no | Default `0`. Must be ≥ 0 |
| `max_selections` | integer | no | Default `1`. Must be ≥ 1 and ≥ min_selections |
| `display_order` | integer | no | Default `0`. Lower = shown first |

**Response:**
```json
{
  "success": true,
  "data": {
    "option_group": {
      "id": "uuid-new-group",
      "menu_item_id": "uuid-item",
      "name": "Choose Size",
      "is_required": true,
      "min_selections": 1,
      "max_selections": 1,
      "display_order": 0,
      "options": []
    }
  }
}
```

---

#### Edit an option group

```
PATCH /menu-items/:itemId/option-groups/:groupId
Content-Type: application/json
```

**Request body (send only fields that changed):**
```json
{
  "name": "Pick Your Size",
  "is_required": true,
  "min_selections": 1,
  "max_selections": 1,
  "display_order": 0
}
```

**Response:** Same shape as create response, with updated values + current options list.

---

#### Delete an option group

```
DELETE /menu-items/:itemId/option-groups/:groupId
```

> **Important:** Deleting a group **automatically deletes all its options** (DB cascade). Always show a confirmation dialog before calling this.

**Response:**
```json
{ "success": true, "message": "Option group deleted" }
```

---

#### Add an option to a group

```
POST /menu-items/:itemId/option-groups/:groupId/options
Content-Type: application/json
```

**Request body:**
```json
{
  "name": "Large",
  "additional_price": 500,
  "is_available": true,
  "display_order": 1
}
```

**Field rules:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Option label shown to customer |
| `additional_price` | number | no | Default `0`. Use `0` for no extra charge |
| `is_available` | boolean | no | Default `true`. Set `false` to hide from customers |
| `display_order` | integer | no | Default `0` |

**Response:**
```json
{
  "success": true,
  "data": {
    "option": {
      "id": "uuid-new-option",
      "group_id": "uuid-group",
      "name": "Large",
      "additional_price": 500,
      "is_available": true,
      "display_order": 1
    }
  }
}
```

---

#### Edit an option

```
PATCH /menu-items/:itemId/option-groups/:groupId/options/:optionId
Content-Type: application/json
```

**Request body (send only fields that changed):**
```json
{
  "name": "Large",
  "additional_price": 600,
  "is_available": true
}
```

**Response:** Same shape as create option response, with updated values.

---

#### Delete an option

```
DELETE /menu-items/:itemId/option-groups/:groupId/options/:optionId
```

**Response:**
```json
{ "success": true, "message": "Option deleted" }
```

---

### 1.4 UI Component Breakdown

#### Add/Edit Group Modal

Triggered by **[+ Add Group]** or **[Edit]** on a group.

```
┌─────────────────────────────────┐
│  Add Option Group               │
├─────────────────────────────────┤
│  Group Name *                   │
│  ┌─────────────────────────┐    │
│  │ e.g. Choose Size        │    │
│  └─────────────────────────┘    │
│                                 │
│  ☑  Required                    │
│     Customer must make a         │
│     selection from this group   │
│                                 │
│  Min selections  Max selections │
│  ┌──────────┐    ┌──────────┐   │
│  │    1     │    │    1     │   │
│  └──────────┘    └──────────┘   │
│                                 │
│  💡 Max = 1 → radio buttons     │
│     Max > 1 → checkboxes        │
│                                 │
│         [Cancel]  [Save Group]  │
└─────────────────────────────────┘
```

**Validation before saving:**
- Name is not empty
- `max_selections >= 1`
- `min_selections >= 0`
- `min_selections <= max_selections`
- If `is_required = true`, auto-set `min_selections` to at least `1`

---

#### Add/Edit Option Modal

Triggered by **[+ Add Option]** or clicking an existing option row.

```
┌─────────────────────────────────┐
│  Add Option                     │
├─────────────────────────────────┤
│  Option Name *                  │
│  ┌─────────────────────────┐    │
│  │ e.g. Large              │    │
│  └─────────────────────────┘    │
│                                 │
│  Additional Price (IQD)         │
│  ┌─────────────────────────┐    │
│  │ 0                       │    │
│  └─────────────────────────┘    │
│  Leave 0 for no extra charge    │
│                                 │
│  ☑  Available                   │
│                                 │
│         [Cancel]  [Save Option] │
└─────────────────────────────────┘
```

---

#### Group Card (inline display)

Each group card shows:
- Group name + badge: **Required** or **Optional**
- Sub-label derived from min/max values (see logic below)
- List of options with name and price
- **[Edit]** and **[Delete]** buttons on the group header
- **[+ Add Option]** at the bottom of the options list
- Each option row has inline **[Edit]** and **[Delete]** icons

**Sub-label logic:**
```
min === max && min === 1  →  "Required · Pick exactly 1"
min === max              →  "Required · Pick exactly {min}"
min === 0 && max === 1   →  "Optional · Pick up to 1"
min === 0                →  "Optional · Pick up to {max}"
min > 0                  →  "Pick {min} to {max}"
```

---

### 1.5 UX Rules & Edge Cases

| Scenario | Behavior |
|---|---|
| Group has no options yet | Show empty state: *"No options yet. Add your first option."* |
| Delete last option in a required group | Allow deletion but show warning: *"This group is required — add at least one option or customers won't be able to order this item."* |
| `is_available: false` on an option | Show it in the dashboard with a **"Hidden"** badge. It will not appear to customers. |
| API returns 403 | Restaurant owner trying to edit an item they don't own. Show: *"You don't have permission to edit this item."* |
| `min_selections > max_selections` | Block save, show inline error: *"Minimum cannot exceed maximum."* |
| Group name empty | Block save, show inline error: *"Group name is required."* |
| Option name empty | Block save, show inline error: *"Option name is required."* |
| Delete group confirmation | *"Delete '{group name}'? All {N} options inside will also be deleted. This cannot be undone."* |
| Delete option confirmation | *"Delete '{option name}'?"* — simple confirm, no extra warning needed |

---

### 1.6 State Management

```
On Edit page load:
  1. GET /menu-items/:itemId              → populate basic info form
  2. GET /menu-items/:itemId/option-groups → populate options section

After any group or option CRUD action:
  → Re-fetch GET /menu-items/:itemId/option-groups
  → Re-render the options section

On Save Basic Info:
  → PUT /menu-items/:itemId  (independent of options, separate button/call)
```

> Do NOT try to manually patch local state after mutations. Always re-fetch the groups list for consistency.

---

### 1.7 Complete URL Reference

| Action | Method | URL |
|---|---|---|
| List groups (with options) | GET | `/api/restaurants/menu-items/:itemId/option-groups` |
| Create group | POST | `/api/restaurants/menu-items/:itemId/option-groups` |
| Edit group | PATCH | `/api/restaurants/menu-items/:itemId/option-groups/:groupId` |
| Delete group | DELETE | `/api/restaurants/menu-items/:itemId/option-groups/:groupId` |
| Add option | POST | `/api/restaurants/menu-items/:itemId/option-groups/:groupId/options` |
| Edit option | PATCH | `/api/restaurants/menu-items/:itemId/option-groups/:groupId/options/:optionId` |
| Delete option | DELETE | `/api/restaurants/menu-items/:itemId/option-groups/:groupId/options/:optionId` |

All endpoints require `Authorization: Bearer {token}` header. A restaurant owner token only has access to items belonging to their own restaurant.

---

*More flows will be added below as features are developed.*
