"""gen_queue.json(옛 그림체 프롬프트 159개) → 3행 '통통한 캐주얼' 그림체 프롬프트 (docs/art/higgsfield/chunky/queue.json)
   python3 -I tools/make_chunky_queue.py"""
import json, os, re, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs/art/higgsfield/gen_queue.json')
OUT = os.path.join(ROOT, 'docs/art/higgsfield/chunky/queue.json')
STYLE = ("Original game character, casual mobile cartoon style. Very simple and chunky: about 2 heads tall, round squat body, "
         "short stubby arms and legs, small simple dot eyes, tiny mouth, minimal facial details, bold clean dark-brown outline of "
         "even thickness, flat colors with one cel-shade tone, slightly muted warm earthy palette with a few bright accents, "
         "no gradients, no sparkles, no small ornaments, toy-like and readable at 48px. Full body, 3/4 front view, standing, "
         "centered, whole character inside the frame with margin. Plain pure white background, no ground, no shadow, no text, "
         "no frame, single character.")
BUST = ("Original game character bust portrait (head and shoulders), casual mobile cartoon style, same look as chunky toy-like "
        "chibi characters: big round head, small simple dot eyes, tiny mouth, bold clean dark-brown outline of even thickness, "
        "flat colors with one cel-shade tone, slightly muted warm earthy palette, no gradients, no sparkles. Facing 3/4 front, "
        "centered. Plain pure white background, no text, no frame, single character.")
TAIL = " Keep it simple: drop tiny ornaments, glitter, sparkles and particle effects; show rarity only with one accent color."
q = json.load(open(SRC, encoding='utf-8'))
out = []
for x in q:
    pr = x['prompt']
    body = pr.split('single character.', 1)[1] if 'single character.' in pr else pr[pr.index('Character:'):]
    body = body.strip()
    body = re.sub(r'\bstill in cute chibi game style\.?\s*', '', body)
    f = x['file']
    if f.startswith('portrait_'):
        kind, file, style = 'person', 'person_' + f[len('portrait_'):], BUST
    elif f.startswith('enemy_'):
        kind, file, style = 'enemy', f, STYLE
    elif f.endswith('_awaken'):
        kind, file, style = 'awaken', f, STYLE
    else:
        kind, file, style = 'tower', f, STYLE
    out.append({'n': x['n'], 'file': file, 'name': x['name'], 'kind': kind, 'prompt': f'{style} {body}{TAIL}'})
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), collections.Counter(o['kind'] for o in out))
