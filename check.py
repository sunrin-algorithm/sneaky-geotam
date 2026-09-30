import json
transcript = r"C:\Users\diamo\.gemini\antigravity-cli\brain\fe49e66e-e795-46e7-a547-d0e8eebe72be\.system_generated\logs\transcript_full.jsonl"
with open(transcript, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if "content" in data and isinstance(data["content"], str):
                if "Successfully ran npm run build with 0 errors" in data["content"]:
                    print("Found build success log!")
        except Exception:
            pass
