/**
 * Visual QA baselines (Visual Blueprint V1.3): re-renders the reference screenshots and overwrites
 * tests/visual-baselines/*.png. Run it only when a visual change is intended, look at every changed image
 * (git diff shows which ones moved), and commit them with the change that caused them.
 *
 *   npm run visual:baselines
 *
 * It runs tests/studio-visual-qa.test.ts with VISUAL_BASELINES_UPDATE=1, on the ILLUSTRATIVE / MOCK DATA fixtures
 * only, and needs a local Chrome (CHROME_PATH or the usual install paths). It reads no brand data and writes only
 * the baseline images. Baselines are made with the Linux Chrome the CI job uses; on another system the images can
 * differ beyond the tolerance, so update them on Linux.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const result = spawnSync(process.execPath, ['--import', 'tsx', path.join(ROOT, 'scripts', 'test.ts'), path.join('tests', 'studio-visual-qa.test.ts')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VISUAL_BASELINES_UPDATE: '1', STUDIO_E2E_REQUIRED: '1' },
})
if (result.status === 0) console.log('Baselines written to tests/visual-baselines/. Review them (git diff --stat) before committing.')
process.exitCode = result.status ?? 1
