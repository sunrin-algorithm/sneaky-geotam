import os

storage_path = 'lib/storage.ts'
with open(storage_path, 'r', encoding='utf-8') as f:
    content = f.read()

# I need to completely rebuild the ends of the two classes properly
# First, remove ALL `renameParticipant` methods to get a clean slate!
import re
# regex to remove from `  async renameParticipant` to `timestamp: new Date().toISOString(),\n    });\n  }\n`
content = re.sub(r'  async renameParticipant.*?\}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'  async renameParticipant.*?\}\n', '', content, flags=re.DOTALL)

with open(storage_path, 'w', encoding='utf-8') as f:
    f.write(content)
