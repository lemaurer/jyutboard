"""Build compact lookup data from the original CC-Canto and CC-CEDICT downloads.
Sources are separately licensed CC BY-SA 3.0. See THIRD_PARTY.md.
Usage: python3 scripts/dictionary.py /path/to/cccanto.zip /path/to/cedict.gz
"""
import sys, gzip, zipfile, re, json
from pathlib import Path
out = {}
cedict = gzip.open(sys.argv[2], 'rt', encoding='utf-8').read()
canto = zipfile.ZipFile(sys.argv[1]).read('cccanto-webdist.txt').decode('utf-8-sig')
for text in (cedict, canto):
    for line in text.splitlines():
        m = re.match(r'^(\S+) (\S+) \[[^\]]*\](?: \{([^}]+)\})? /(.*)/$', line)
        if not m: continue
        trad, simp, jyut, definition = m.groups()
        definition = definition.replace('/', '; ')
        for word in set((trad,simp)):
            if len(word) <= 16: out[word] = [jyut or '', definition[:600]]
Path('public/dictionary.js').write_text('globalThis.JYUTBOARD_DICTIONARY='+json.dumps(out, ensure_ascii=False, separators=(',',':'))+';\n')
print('Dictionary entries:',len(out))
