import os
import re

path = 'lib/storage.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix duplicates in audit log
content = re.sub(r'(action: "participant\.rename" as any,)(\n\s*operationId: crypto\.randomUUID\(\),\n\s*targetType: "inspection",)+', r'\1\n      operationId: crypto.randomUUID(),\n      targetType: "inspection",', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
