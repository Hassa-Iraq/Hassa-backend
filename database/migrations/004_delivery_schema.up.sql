-- Create delivery schema
CREATE SCHEMA IF NOT EXISTS delivery;

-- Create drivers table
CREATE TABLE IF NOT EXISTS delivery.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Reference to auth.users.id (no FK due to schema isolation)
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    vehicle_type VARCHAR(50),
    vehicle_number VARCHAR(50),
    is_available BOOLEAN DEFAULT true,
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create deliveries table
CREATE TABLE IF NOT EXISTS delivery.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL, -- Reference to orders.orders.id (no FK)
    driver_id UUID REFERENCES delivery.drivers(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    pickup_address TEXT,
    delivery_address TEXT NOT NULL,
    estimated_pickup_time TIMESTAMP WITH TIME ZONE,
    estimated_delivery_time TIMESTAMP WITH TIME ZONE,
    actual_pickup_time TIMESTAMP WITH TIME ZONE,
    actual_delivery_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_drivers_user_id ON delivery.drivers(user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_is_available ON delivery.drivers(is_available);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON delivery.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON delivery.deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON delivery.deliveries(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION delivery.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON delivery.drivers
    FOR EACH ROW EXECUTE FUNCTION delivery.update_updated_at_column();

CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON delivery.deliveries
    FOR EACH ROW EXECUTE FUNCTION delivery.update_updated_at_column();
