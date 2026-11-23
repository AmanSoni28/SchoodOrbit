import 'dotenv/config';
// Point every test at the dedicated test database, never the dev database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
