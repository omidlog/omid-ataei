// Side-effect import: must stay the first import of scripts/brand.ts (see cli-errors.ts).
import { installCliErrorHandler } from './cli-errors.js'

installCliErrorHandler(process.argv[2], process.cwd())
