"""Rebuild the offline reading catalogue from the preserved CC0 source snapshot."""
from pathlib import Path
import json, re, html

ROOT = Path(__file__).resolve().parents[1]
sources = json.loads((ROOT / 'maintenance/reading-sources.json').read_text())

def clean(text):
    # Bilara's <j> is a line-joining instruction, not part of the translation.
    return html.unescape(re.sub(r'<[^>]*>', '', text)).strip()

def paragraphs(data, dhp=False):
    groups = {}
    for key, value in data.items():
        ref, segment = key.split(':')
        if segment.startswith('0.') or not clean(value):
            continue
        group = ref if dhp else segment.split('.')[0]
        groups.setdefault(group, []).append((key, clean(value)))
    return [{'ref': group if dhp else rows[0][0],
             'label': group[3:] if dhp else '',
             'text': '\n'.join(value for _, value in rows)}
            for group, rows in groups.items()]

def source_file(name):
    return json.loads(sources[name + '_translation-en-sujato.json']['content'])

common = dict(language='English', translator='Bhikkhu Sujato', license='CC0 1.0 · Public domain',
              licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',
              note='Complete translation, preserved from SuttaCentral. Paragraph and verse layout adapted for reading; wording is unchanged. Line-joining markup is removed.')

chapters = []
for filename in sorted((f for f in sources if f.startswith('dhp')), key=lambda f:int(re.search(r'dhp(\d+)', f)[1])):
    data = json.loads(sources[filename]['content'])
    start, end = re.search(r'dhp(\d+)-(\d+)', filename).groups()
    title = next(clean(v) for k,v in data.items() if k.endswith(':0.3'))
    chapters.append(dict(title=title, reference=f'Verses {start}–{end}',
                         sourceUrl=f'https://suttacentral.net/dhp{start}-{end}/en/sujato',
                         paragraphs=paragraphs(data, True)))

books = [dict(common, id='dhammapada', title='Dhammapada', subtitle='Sayings of the Dhamma',
              tradition='Early Buddhism', reference='Dhp 1–423', kind='26 chapters · 423 verses',
              description='The complete collection, one short verse at a time: the mind, kindness, care and freedom.',
              sourceUrl='https://suttacentral.net/dhp1-20/en/sujato', sections=chapters)]

for id, title, subtitle, ref, description in [
    ('metta', 'Loving-Kindness', 'Karaṇīya Mettā Sutta', 'snp1.8', 'A boundless heart of goodwill toward every living being.'),
    ('blessings', 'Blessings', 'Maṅgala Sutta', 'snp2.4', 'A good life rooted in wise friendship, learning, gratitude and patient practice.'),
    ('first-teaching', 'The First Teaching', 'Dhammacakkappavattana Sutta', 'sn56.11', 'The middle way, the Four Noble Truths and the Noble Eightfold Path.'),
    ('eight-precepts', 'The Eight Precepts', 'Uposatha with eight factors', 'an8.41', 'The Buddha’s teaching on one day and night of observance.')
]:
    data = source_file(ref)
    books.append(dict(common, id=id, title=title, subtitle=subtitle,
                      tradition='Early Buddhism', reference=ref.upper().replace('SNP','Snp '), kind='Complete discourse',
                      description=description, sourceUrl=f'https://suttacentral.net/{ref}/en/sujato',
                      sections=[dict(title=title, paragraphs=paragraphs(data))]))

heart = [
    'When the bodhisattva Avalokiteśvara was practicing the profound perfection of wisdom, he saw clearly that the five aggregates are all empty, and passed beyond all suffering and distress.',
    'Śāriputra, form is not different from emptiness, and emptiness is not different from form. Form itself is emptiness; emptiness itself is form. Feeling, perception, formations and consciousness are also like this.',
    'Śāriputra, all phenomena have the character of emptiness: they neither arise nor cease, are neither defiled nor pure, and neither increase nor decrease.',
    'Therefore, in emptiness there is no form, no feeling, perception, formations or consciousness; no eye, ear, nose, tongue, body or mind; no visible form, sound, smell, taste, touch or mental object; no realm of the eye, and so on up to no realm of mind-consciousness.',
    'There is no ignorance and no ending of ignorance, and so on up to no aging and death and no ending of aging and death. There is no suffering, origin, cessation or path; no knowledge and no attainment.',
    'Because there is nothing to attain, the bodhisattva relies on the perfection of wisdom, and the mind is unobstructed. Being unobstructed, it is without fear. Far beyond confused, dreamlike thinking, the bodhisattva reaches ultimate nirvāṇa.',
    'All the buddhas of the past, present and future rely on the perfection of wisdom and attain unsurpassed, complete and perfect awakening.',
    'Know, then, that the perfection of wisdom is the great powerful mantra, the mantra of great illumination, the unsurpassed mantra, the unequalled mantra. It removes all suffering. It is true, without deception.',
    'Therefore the mantra of the perfection of wisdom is spoken, saying:',
    'Gate gate pāragate pārasaṃgate bodhi svāhā.'
]
books.insert(1, dict(id='heart-sutra', title='The Heart Sutra', subtitle='The perfection of wisdom in a few lines',
                    tradition='Mahayana', reference='Taishō T 251 · 848c06–22', kind='Complete short Chinese recension',
                    description='Avalokiteśvara’s teaching on emptiness, wisdom and freedom from fear.', language='English',
                    translator='New English rendering by ChatGPT, 2026, from Xuanzang’s Chinese recension',
                    license='New rendering of an ancient public-domain text',
                    sourceUrl='https://cbetaonline.dila.edu.tw/zh/T0251_001',
                    note='A new reading translation, not a published scholarly edition. Based on T 251, 848c06–22, as preserved by CBETA. The later preface and textual apparatus are not part of the sutra and are omitted. The mantra is transliterated. “Empty” here means empty of independent, inherent existence.',
                    sections=[dict(title='The Heart Sutra', paragraphs=[dict(ref=f'T251:{i+1}',label='',text=p) for i,p in enumerate(heart)])]))

(ROOT/'docs/assets/readings-v17.json').write_text(json.dumps(dict(version=1, books=books), ensure_ascii=False, indent=2)+'\n')
print(f'Built {len(books)} complete readings; Dhammapada: {len(chapters)} chapters, {sum(len(c["paragraphs"]) for c in chapters)} verses')
