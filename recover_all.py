import json
import os

transcript = r"C:\Users\diamo\.gemini\antigravity-cli\brain\fe49e66e-e795-46e7-a547-d0e8eebe72be\.system_generated\logs\transcript_full.jsonl"
files = {}

with open(transcript, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if "tool_calls" in data:
                for tc in data["tool_calls"]:
                    name = tc.get("name")
                    args = tc.get("args", {})
                    
                    if name == "write_to_file":
                        target = args.get("TargetFile", "")
                        content = args.get("CodeContent", "")
                        if target:
                            files[target] = content
                    elif name == "replace_file_content":
                        target = args.get("TargetFile", "")
                        # Hard to replay easily, but we can print what was replaced
                        pass
        except Exception:
            pass

# Output the files that were written
for k in files.keys():
    print(k)
