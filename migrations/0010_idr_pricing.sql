-- OrbitDesk plan pricing is stored as whole Indonesian Rupiah (IDR), not cents.
UPDATE plans SET monthly_price_cents = 59000 WHERE id = 'premium';
UPDATE plans SET monthly_price_cents = 129000 WHERE id = 'business';
