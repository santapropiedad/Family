process.env.PGLITE_MEMORY = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-not-for-production";
// Nunca enviar push real durante las pruebas, aunque .env.local tenga claves configuradas.
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
