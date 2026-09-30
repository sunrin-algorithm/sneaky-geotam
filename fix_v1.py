import glob
import os

for fpath in glob.glob("functions/src/*.ts"):
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    
    content = content.replace('from "firebase-functions"', 'from "firebase-functions/v1"')
    
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)
