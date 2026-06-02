import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

// Small app-level settings persisted next to Electron's userData. This file must
// live at a FIXED location (userData) because it tells us where the movable
// novel database lives — it cannot itself live inside the movable directory.
type AppSettings = {
  dataDir?: string;
};

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json');
}

function readSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as AppSettings;
    }
  } catch {
    // Missing or malformed settings fall back to defaults.
  }
  return {};
}

function writeSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

/** The user-chosen data directory, or null when using the default userData location. */
export function getDataDirectory(): string | null {
  const dir = readSettings().dataDir;
  return typeof dir === 'string' && dir.trim().length > 0 ? dir : null;
}

/** Persist the chosen data directory. Pass null to clear it (revert to default). */
export function setDataDirectory(dir: string | null): void {
  const settings = readSettings();
  if (dir && dir.trim().length > 0) {
    settings.dataDir = dir;
  } else {
    delete settings.dataDir;
  }
  writeSettings(settings);
}
