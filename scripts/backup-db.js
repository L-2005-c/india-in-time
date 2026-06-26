const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

const DB_FILES = ['india-in-time.db', 'india-in-time.db-wal', 'india-in-time.db-shm'];

function backup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = path.join(BACKUP_DIR, `backup-${timestamp}`);
  
  fs.mkdirSync(backupFolder);

  console.log(`📦 Starting database backup to: ${backupFolder}`);
  let successCount = 0;

  for (const file of DB_FILES) {
    const srcPath = path.join(DB_DIR, file);
    const destPath = path.join(backupFolder, file);

    if (fs.existsSync(srcPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✅ Copied ${file}`);
        successCount++;
      } catch (err) {
        console.error(`  ❌ Failed to copy ${file}:`, err.message);
      }
    } else {
      console.log(`  ℹ️ Skipped ${file} (does not exist)`);
    }
  }

  console.log(`🎉 Backup complete! Successfully backed up ${successCount} file(s).`);
}

backup();
