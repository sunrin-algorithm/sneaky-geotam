import json

# package.json
with open('functions/package.json', 'r') as f:
    pkg = json.load(f)

pkg['main'] = 'lib/index.js'
pkg['scripts']['build'] = 'tsc'
pkg['scripts']['serve'] = 'npm run build && firebase emulators:start --only functions'
pkg['scripts']['shell'] = 'npm run build && firebase functions:shell'
pkg['scripts']['start'] = 'npm run shell'
pkg['scripts']['deploy'] = 'firebase deploy --only functions'
pkg['scripts']['logs'] = 'firebase functions:log'

with open('functions/package.json', 'w') as f:
    json.dump(pkg, f, indent=2)

# tsconfig.json
with open('functions/tsconfig.json', 'w') as f:
    f.write("""{
  "compilerOptions": {
    "module": "commonjs",
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "outDir": "lib",
    "sourceMap": true,
    "strict": true,
    "target": "es2020",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "compileOnSave": true,
  "include": [
    "src"
  ]
}""")

import os
if not os.path.exists('functions/src'):
    os.makedirs('functions/src')

with open('functions/src/index.ts', 'w') as f:
    f.write("""import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Export all functions
export * from "./reservations";
export * from "./inspections";
export * from "./participants";
""")
