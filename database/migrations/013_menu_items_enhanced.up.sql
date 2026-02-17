-- Add enhanced fields to menu_items table
ALTER TABLE restaurant.menu_items
ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_purchase_quantity INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS stock_type VARCHAR(20) DEFAULT 'unlimited',
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS search_tags TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS available_start_time TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS available_end_time TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS food_type VARCHAR(10) DEFAULT 'veg';

-- Add constraints
ALTER TABLE restaurant.menu_items
ADD CONSTRAINT chk_discount_type CHECK (discount_type IS NULL OR discount_type IN ('fixed', 'percentage')),
ADD CONSTRAINT chk_stock_type CHECK (stock_type IN ('unlimited', 'limited', 'daily')),
ADD CONSTRAINT chk_food_type CHECK (food_type IN ('veg', 'non_veg')),
ADD CONSTRAINT chk_prep_time CHECK (prep_time_minutes IS NULL OR prep_time_minutes > 0),
ADD CONSTRAINT chk_discount_value CHECK (discount_value IS NULL OR discount_value >= 0),
ADD CONSTRAINT chk_max_purchase_qty CHECK (max_purchase_quantity IS NULL OR max_purchase_quantity > 0),
ADD CONSTRAINT chk_stock CHECK (stock IS NULL OR stock >= 0);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_food_type ON restaurant.menu_items(food_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_stock_type ON restaurant.menu_items(stock_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_available_time ON restaurant.menu_items(available_start_time, available_end_time);

-- Create item_variations table
CREATE TABLE IF NOT EXISTS restaurant.item_variations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES restaurant.menu_items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_required BOOLEAN DEFAULT false,
    selection_type VARCHAR(20) NOT NULL DEFAULT 'single',
    min_selection INTEGER DEFAULT 1,
    max_selection INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_selection_type CHECK (selection_type IN ('single', 'multiple')),
    CONSTRAINT chk_min_max_selection CHECK (min_selection >= 0 AND max_selection >= min_selection)
);

-- Create variation_groups table
CREATE TABLE IF NOT EXISTS restaurant.variation_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variation_id UUID NOT NULL REFERENCES restaurant.item_variations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    stock INTEGER DEFAULT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_variation_group_price CHECK (price >= 0),
    CONSTRAINT chk_variation_group_stock CHECK (stock IS NULL OR stock >= 0)
);

-- Create choice_groups table (addons)
CREATE TABLE IF NOT EXISTS restaurant.choice_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurant.restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    min_choices INTEGER DEFAULT 0,
    max_choices INTEGER DEFAULT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_min_choices CHECK (min_choices >= 0),
    CONSTRAINT chk_max_choices CHECK (max_choices IS NULL OR max_choices >= min_choices)
);

-- Create choices table (addon items)
CREATE TABLE IF NOT EXISTS restaurant.choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    choice_group_id UUID NOT NULL REFERENCES restaurant.choice_groups(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.00,
    is_available BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_choice_price CHECK (price >= 0)
);

-- Create menu_item_choice_groups table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS restaurant.menu_item_choice_groups (
    menu_item_id UUID NOT NULL REFERENCES restaurant.menu_items(id) ON DELETE CASCADE,
    choice_group_id UUID NOT NULL REFERENCES restaurant.choice_groups(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    PRIMARY KEY (menu_item_id, choice_group_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_item_variations_menu_item_id ON restaurant.item_variations(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_variation_groups_variation_id ON restaurant.variation_groups(variation_id);
CREATE INDEX IF NOT EXISTS idx_choice_groups_restaurant_id ON restaurant.choice_groups(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_choices_choice_group_id ON restaurant.choices(choice_group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_choice_groups_menu_item_id ON restaurant.menu_item_choice_groups(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_choice_groups_choice_group_id ON restaurant.menu_item_choice_groups(choice_group_id);

-- Create triggers for updated_at
CREATE TRIGGER update_item_variations_updated_at BEFORE UPDATE ON restaurant.item_variations
    FOR EACH ROW EXECUTE FUNCTION restaurant.update_updated_at_column();

CREATE TRIGGER update_variation_groups_updated_at BEFORE UPDATE ON restaurant.variation_groups
    FOR EACH ROW EXECUTE FUNCTION restaurant.update_updated_at_column();

CREATE TRIGGER update_choice_groups_updated_at BEFORE UPDATE ON restaurant.choice_groups
    FOR EACH ROW EXECUTE FUNCTION restaurant.update_updated_at_column();

CREATE TRIGGER update_choices_updated_at BEFORE UPDATE ON restaurant.choices
    FOR EACH ROW EXECUTE FUNCTION restaurant.update_updated_at_column();
