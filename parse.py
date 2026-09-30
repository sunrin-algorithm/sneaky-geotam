import json
import re

transcript = r"C:\Users\diamo\.gemini\antigravity-cli\brain\fe49e66e-e795-46e7-a547-d0e8eebe72be\.system_generated\logs\transcript_full.jsonl"
edits = []
storage_content = ""

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
                        if "storage.ts" in target:
                            storage_content = args.get("CodeContent", "")
                    elif name == "replace_file_content":
                        target = args.get("TargetFile", "")
                        if "storage.ts" in target:
                            # Not easy to apply patch, we'll just track
                            pass
                    elif name == "run_command":
                        cmd = args.get("CommandLine", "")
                        if "Set-Content" in cmd and "storage.ts" in cmd:
                            edits.append(cmd)
        except Exception as e:
            pass
            
with open("edits.txt", "w", encoding="utf-8") as out:
    out.write("\n\n---\n\n".join(edits))
