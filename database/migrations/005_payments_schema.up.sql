-- Create payments schema
CREATE SCHEMA IF NOT EXISTS payments;

-- Create wallets table
CREATE TABLE IF NOT EXISTS payments.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Reference to auth.users.id (no FK due to schema isolation)
    balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL, -- Reference to orders.orders.id (no FK)
    user_id UUID NOT NULL, -- Reference to auth.users.id (no FK)
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    transaction_id VARCHAR(255),
    payment_gateway_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON payments.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments.payments(transaction_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION payments.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON payments.wallets
    FOR EACH ROW EXECUTE FUNCTION payments.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments.payments
    FOR EACH ROW EXECUTE FUNCTION payments.update_updated_at_column();
