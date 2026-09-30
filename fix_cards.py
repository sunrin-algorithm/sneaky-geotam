import os
import re

path = "app/admin/page.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix contrast in "공통 질문 검사 (5문항)" card
content = content.replace(
    'inspectionMode === "common" ? "text-neutral-300" : "text-neutral-500"',
    'inspectionMode === "common" ? "text-white/80" : "text-neutral-500"'
)

# 2. Fix contrast in "자율 질문 검사" card
content = content.replace(
    'inspectionMode === "custom" ? "text-neutral-300" : "text-neutral-500"',
    'inspectionMode === "custom" ? "text-white/80" : "text-neutral-500"'
)

# 3. Add min-h to the two mode selection cards
content = content.replace(
    'className={`rounded-xl border p-4 text-left transition ${',
    'className={`rounded-xl border p-4 text-left transition flex flex-col justify-center min-h-[160px] ${'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
