import json
import os

transcript = r"C:\Users\diamo\.gemini\antigravity-cli\brain\fe49e66e-e795-46e7-a547-d0e8eebe72be\.system_generated\logs\transcript_full.jsonl"

def apply_replace(file_path, target, replacement):
    if not os.path.exists(file_path):
        return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if target in content:
        content = content.replace(target, replacement)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

# We will replay all writes and replaces
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
                            # ensure dir exists
                            os.makedirs(os.path.dirname(target), exist_ok=True)
                            with open(target, 'w', encoding='utf-8') as out:
                                out.write(content)
                    elif name == "replace_file_content":
                        target = args.get("TargetFile", "")
                        t_content = args.get("TargetContent", "")
                        r_content = args.get("ReplacementContent", "")
                        if target and t_content:
                            apply_replace(target, t_content, r_content)
                    elif name == "run_command":
                        # Dangerous to replay all run_command, we'll skip them
                        # Hopefully replace_file_content covers most edits
                        pass
        except Exception:
            pass

print("Replay completed!")
