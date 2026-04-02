-- Option groups per menu item (e.g. "Choose Size", "Add-ons", "Sauce")
CREATE TABLE IF NOT EXISTS restaurant.menu_item_option_groups (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id   UUID          NOT NULL REFERENCES restaurant.menu_items(id) ON DELETE CASCADE,
  name           VARCHAR(100)  NOT NULL,
  is_required    BOOLEAN       NOT NULL DEFAULT false,
  min_selections INT           NOT NULL DEFAULT 0,
  max_selections INT           NOT NULL DEFAULT 1,
  display_order  INT           NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_option_groups_menu_item_id
  ON restaurant.menu_item_option_groups (menu_item_id);

-- Individual options within a group (e.g. "Large +500", "Extra Cheese +250")
CREATE TABLE IF NOT EXISTS restaurant.menu_item_options (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID          NOT NULL REFERENCES restaurant.menu_item_option_groups(id) ON DELETE CASCADE,
  name             VARCHAR(100)  NOT NULL,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_available     BOOLEAN       NOT NULL DEFAULT true,
  display_order    INT           NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_options_group_id
  ON restaurant.menu_item_options (group_id);

-- Snapshot of what customer selected per order item (prices frozen at order time)
CREATE TABLE IF NOT EXISTS orders.order_item_selected_options (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id    UUID          NOT NULL REFERENCES orders.order_items(id) ON DELETE CASCADE,
  option_id        UUID          NOT NULL,
  group_id         UUID          NOT NULL,
  group_name       VARCHAR(100)  NOT NULL,
  option_name      VARCHAR(100)  NOT NULL,
  additional_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_item_selected_options_order_item_id
  ON orders.order_item_selected_options (order_item_id);

-- updated_at triggers for new restaurant tables
DROP TRIGGER IF EXISTS menu_item_option_groups_updated_at ON restaurant.menu_item_option_groups;
CREATE TRIGGER menu_item_option_groups_updated_at
  BEFORE UPDATE ON restaurant.menu_item_option_groups
  FOR EACH ROW EXECUTE PROCEDURE restaurant.set_updated_at();

DROP TRIGGER IF EXISTS menu_item_options_updated_at ON restaurant.menu_item_options;
CREATE TRIGGER menu_item_options_updated_at
  BEFORE UPDATE ON restaurant.menu_item_options
  FOR EACH ROW EXECUTE PROCEDURE restaurant.set_updated_at();
