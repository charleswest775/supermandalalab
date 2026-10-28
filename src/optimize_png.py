import os, sys
from PIL import Image
root = sys.argv[1]
for d, _, files in os.walk(root):
    for f in files:
        if f.endswith('.png') or f == 'favicon.ico':
            p = os.path.join(d, f)
            im = Image.open(p).convert('RGBA')
            im.quantize(colors=48, method=Image.Quantize.FASTOCTREE).save(p, format='PNG', optimize=True)
