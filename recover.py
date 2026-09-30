import json
import os
import re

transcript_path = r"C:\Users\diamo\.gemini\antigravity-cli\brain\fe49e66e-e795-46e7-a547-d0e8eebe72be\.system_generated\logs\transcript_full.jsonl"
with open(transcript_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for line in reversed(lines):
    try:
        data = json.loads(line)
        if "content" in data and isinstance(data["content"], str):
            content = data["content"]
            if "export class LocalInspectionRepository implements InspectionRepository {" in content:
                print("Found match in content of length:", len(content))
                with open("recovery.txt", "w", encoding="utf-8") as out:
                    out.write(content)
                break
    except Exception as e:
        pass
