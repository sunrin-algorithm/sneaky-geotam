import glob

for fpath in glob.glob("functions/src/*.ts"):
    with open(fpath, "r", encoding="utf-8-sig") as f:
        content = f.read()
    with open(fpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
