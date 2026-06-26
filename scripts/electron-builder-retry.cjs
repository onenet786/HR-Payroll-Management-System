#!/usr/bin/env node

const fs = require('fs');

const retryableCodes = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY']);
const originalRename = fs.promises.rename.bind(fs.promises);
const originalRenameCallback = fs.rename.bind(fs);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function renameWithRetry(from, to) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await originalRename(from, to);
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error?.code)) throw error;
      await sleep(250);
    }
  }

  if (lastError && retryableCodes.has(lastError.code)) {
    await fs.promises.rm(to, { recursive: true, force: true });
    await fs.promises.cp(from, to, { recursive: true, force: true });
    await fs.promises.rm(from, { recursive: true, force: true });
    return;
  }

  throw lastError;
}

fs.promises.rename = renameWithRetry;
fs.rename = (from, to, callback) => {
  renameWithRetry(from, to).then(
    () => callback(null),
    error => callback(error)
  );
};

require('../node_modules/electron-builder/out/cli/cli');
