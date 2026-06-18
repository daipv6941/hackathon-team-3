import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve repo root from this file's location (tests/unit/ → src/ → package/ → packages/ → root)
const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..');

describe('permission-keys codegen', () => {
  it('committed file matches a fresh generation', () => {
    const path = 'packages/shared-rbac/src/generated/permission-keys.ts';
    const before = readFileSync(resolve(repoRoot, path), 'utf8');

    try {
      execSync('pnpm exec tsx scripts/gen-rbac.ts', {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    } catch (e: any) {
      console.error('\n=== EXEC FAILED ===');
      console.error('repoRoot =', repoRoot);
      console.error('STDOUT:\n', e.stdout?.toString());
      console.error('STDERR:\n', e.stderr?.toString());
      throw e;
    }

    const after = readFileSync(resolve(repoRoot, path), 'utf8');

    if (before !== after) {
      console.error('\n=== CODEGEN DRIFT DETECTED ===');
      console.error('\n=== BEFORE (committed) ===\n', before.substring(0, 500));
      console.error('\n=== AFTER (generated) ===\n', after.substring(0, 500));

      // Show line-by-line diff
      const beforeLines = before.split('\n');
      const afterLines = after.split('\n');
      console.error('\n=== LINE DIFF ===');
      for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
        if (beforeLines[i] !== afterLines[i]) {
          console.error(`Line ${i + 1}:`);
          console.error(`  BEFORE: ${beforeLines[i]}`);
          console.error(`  AFTER:  ${afterLines[i]}`);
        }
      }
    }

    expect(after).toBe(before);
  });
});
