"""Write an artifact-ready copy of index.html (the viewer supplies the doctype/html/head/body wrapper).

Usage: python3 garage/build-artifact.py <output.html>
"""
import re, sys, pathlib
src = (pathlib.Path(__file__).parent / "index.html").read_text()
for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</?head>\s*', r'<body>\s*', r'</body>\s*', r'</html>\s*',
            r'<meta charset="utf-8">\s*', r'<meta name="viewport"[^>]*>\s*']:
    src = re.sub(pat, '', src, flags=re.I)
pathlib.Path(sys.argv[1]).write_text(src)
print(f"wrote {sys.argv[1]} ({len(src):,} bytes)")
