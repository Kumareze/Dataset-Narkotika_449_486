"""Isolated test oracle: no runtime Python dependency in the website.
SequenceMatcher(autojunk=False) is Python difflib's exact matching-block ratio.
Disabling autojunk avoids dropping frequent letters in long legal passages.
"""
import json
import hashlib
import re
import sys
from difflib import SequenceMatcher
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from Sastrawi.StopWordRemover.StopWordRemoverFactory import StopWordRemoverFactory

raw = open(sys.argv[1], encoding='utf-8').read() if len(sys.argv) > 1 else sys.stdin.buffer.read().decode('utf-8')
payload = json.loads(raw)
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
similarities = {case['id']: SequenceMatcher(None, norm(case['actual']), norm(case['expected']), autojunk=False).ratio() for case in payload['amar']}
stemmer = StemmerFactory().create_stemmer()
stems = {word: stemmer.stem(word) for word in payload['vocabulary']}
output = open(sys.argv[2], 'w', encoding='utf-8') if len(sys.argv) > 2 else sys.stdout
json.dump({'inputHash': hashlib.sha256(raw.encode('utf-8')).hexdigest(), 'similarities': similarities, 'stems': stems, 'stopwords': StopWordRemoverFactory().get_stop_words()}, output)
