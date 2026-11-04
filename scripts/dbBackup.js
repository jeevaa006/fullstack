require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

/*
 * Writes every collection in the configured database to a timestamped JSON file
 * under backups/. Run this before any destructive maintenance.
 */

async function backup() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_DB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI (or MONGO_DB_URI) must be configured before backing up.');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const dump = { database: db.databaseName, takenAt: new Date().toISOString(), collections: {} };

  for (const { name } of await db.listCollections().toArray()) {
    dump.collections[name] = await db.collection(name).find({}).toArray();
  }

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `carebridge-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2));

  const summary = Object.entries(dump.collections).map(([name, rows]) => `${name}=${rows.length}`).join(', ');
  console.log(`Backup written to ${path.relative(process.cwd(), file)}`);
  console.log(`Collections: ${summary || '(none)'}`);
  await mongoose.disconnect();
}

backup().catch(async (error) => {
  console.error(`Backup failed: ${error.message}`);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
