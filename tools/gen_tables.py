#!/usr/bin/env python3
"""데이터 검증 + 문서 표 자동 생성.

사용법:  python3 tools/gen_tables.py          (검사 후 docs/*.md 의 GEN 구역을 다시 씀)
         python3 tools/gen_tables.py --check  (검사만, 문서는 건드리지 않음)

- src/data/towers.json, src/data/enemies.json 을 읽는다.
- 규칙 위반이 있으면 목록을 출력하고 종료 코드 1.
- 문서 안의 <!-- GEN:이름 --> ... <!-- /GEN:이름 --> 구역만 교체한다.
"""
import json, math, re, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
T = json.load(open(ROOT / "src/data/towers.json", encoding="utf-8"))
E = json.load(open(ROOT / "src/data/enemies.json", encoding="utf-8"))
towers = T["towers"]; BASE = T["baseDps"]
GRADES = ["normal", "rare", "unique", "hero", "legend", "god", "hidden"]
GK = {"normal": "노말", "rare": "레어", "unique": "유니크", "hero": "히어로", "legend": "레전드", "god": "신", "hidden": "히든"}
SHAPE = {"single": "단일", "melee": "근접 단일", "aoe": "광역", "melee_aoe": "근접 광역", "pierce": "관통", "chain": "연쇄", "multi": "다중", "global": "전체"}
DMG = {"physical": "물리", "magic": "마법", "hybrid": "혼합", "true": "고정"}
byid = {t["id"]: t for t in towers}

# ---------- 전투력 모델 (BALANCE.md 2.1과 같은 식) ----------
def shape_factor(t):
    s, v = t["shape"], t["shapeValue"]
    if s in ("aoe", "melee_aoe"): return min(4.0, 1 + 1.5 * v)
    if s == "pierce": return 1 + (v - 1) * 0.5
    if s == "multi": return 1 + (v - 1) * 0.6
    if s == "chain": return 1 + 0.7 * sum(0.8 ** k for k in range(1, int(v)))
    if s == "global": return 5.0
    return 1.0
def dot_factor(t):
    d = t.get("dot")
    if not d: return 1.0
    if d["stacks"] > 1:
        stacks = min(d["stacks"], max(1, t["aps"] * d["dur"]))
        return 1 + d["perSec"] * stacks / t["aps"]
    return 1 + d["perSec"] * d["dur"] * 0.6
def crit_factor(t): return 1 + t["crit"] * (t["critMul"] - 1)
def hit(t): return t["atk"] + t["matk"] + t.get("tatk", 0)
def single_dps(t): return hit(t) * t["aps"] * crit_factor(t) * dot_factor(t)
def power(t): return single_dps(t) * shape_factor(t)
def ratio(t): return power(t) / BASE[t["grade"]]

def reduction(a): return a / (a + 100) if a > 0 else 0.0
def armor_at(base, s): return base * (1 + 0.02 * s) + max(0, s - 100)
def eff_dps(t, arm, mr, pen_up=0.0):
    """방어 관통 강화 pen_up(0~0.6)을 더한 실효 단일 DPS"""
    a = max(0.0, arm * (1 - min(0.9, t["armorPen"] + pen_up)))
    m = max(0.0, mr * (1 - min(0.9, t["magicPen"] + pen_up)))
    raw = t["aps"] * crit_factor(t)
    dmg = t["atk"] * (1 - reduction(a)) + t["matk"] * (1 - reduction(m)) + t.get("tatk", 0)
    return dmg * raw * dot_factor(t)

# ---------- 검사 ----------
errors = []
need_special = {"normal": 2, "rare": 4, "unique": 6, "hero": 8, "legend": 10}
deck_min = {"normal": 1, "rare": 2, "unique": 3, "hero": 4, "legend": 5}
for g in need_special:
    gs = [t for t in towers if t["grade"] == g]
    if len(gs) != 10: errors.append(f"{GK[g]} 타워 수 {len(gs)} (10이어야 함)")
    sp = sum(t["special"] for t in gs)
    if sp != need_special[g]: errors.append(f"{GK[g]} 특색 수 {sp} (기준 {need_special[g]})")
    base = [t for t in gs if t["unlock"] == "base"]
    if len(base) != 5: errors.append(f"{GK[g]} 기본 해금 {len(base)}종 (5종이어야 함)")
    if sum(t["special"] for t in base) < deck_min[g]: errors.append(f"{GK[g]} 기본 덱 특색 부족")
for t in towers:
    r = ratio(t)
    lo, hi = (0.40, 0.90) if t["special"] and t["grade"] not in ("god", "hidden") else (0.85, 1.30)
    if t["grade"] in ("god", "hidden"): lo, hi = 0.45, 1.25
    if not (lo <= r <= hi): errors.append(f"{t['name']} 전투력 지수 {r:.2f} (허용 {lo}~{hi})")
    for k in ("aps", "range"):
        if t[k] <= 0: errors.append(f"{t['name']} {k} <= 0")
    if t.get("recipe"):
        for rid in t["recipe"]:
            if rid not in byid: errors.append(f"{t['name']} 조합 재료 {rid} 없음")
detect = [t["name"] for t in towers if t["detect"] != "none" and t["grade"] in need_special]
if len(detect) < 6: errors.append("감지 타워가 너무 적음")
for c in E["composition"]:
    if sum(c["mix"].values()) != 20: errors.append(f"등장 구성 {c['stages']} 합계가 20이 아님")

# ---------- 표 생성 ----------
def fmt(x):
    if x == 0: return "—"
    if x >= 10000: return f"{x/10000:.1f}만".replace(".0만", "만")
    return f"{x:,.0f}" if x >= 10 else (f"{x:.1f}".rstrip("0").rstrip("."))
def area(t):
    s, v = t["shape"], t["shapeValue"]
    if s in ("aoe", "melee_aoe"): return f"{SHAPE[s]} r{v:g}"
    if s in ("pierce", "chain", "multi"): return f"{SHAPE[s]} {int(v)}"
    return SHAPE[s]
def det(t):
    if t["detect"] == "aura": return "👁오라 " + ("맵 전체" if t["detectRange"] >= 50 else f"r{t['detectRange']:g}")
    if t["detect"] == "self": return "👁자신"
    return ""
def rng(t): return "맵 전체" if t["range"] >= 50 else f"{t['range']:g}"
def pct(x): return f"{x*100:.0f}%" if x else "—"

def tower_table(g):
    rows = ["| 타워 | 구분 | 피해 | 물리 공격력 | 마법 공격력 | 공속 | 사거리 | 공격 범위 | 방어 관통 | 마법 관통 | 치명타 | 감지 | 단일 DPS | 전투력 지수 | 특수 능력 (Lv1 → Lv15) | 각성 |",
            "|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|"]
    for t in [x for x in towers if x["grade"] == g]:
        name = ("★ **" + t["name"] + "**") if t["special"] and g not in ("god", "hidden") else t["name"]
        if g == "god": name = "👑 " + t["name"]
        if g == "hidden": name = "💠 " + t["name"]
        unlock = {"base": "기본", "unlock": "해금", "god": "0.01%", "recipe": "조합"}[t["unlock"]]
        dmgtype = DMG[t["damageType"]]
        atk = fmt(t["atk"]) if t["damageType"] != "true" else f"고정 {fmt(t['tatk'])}"
        crit = f"{t['crit']*100:.0f}% ×{t['critMul']:g}" if t["crit"] else "—"
        rows.append(f"| {name} | {unlock} | {dmgtype} | {atk} | {fmt(t['matk'])} | {t['aps']:g} | {rng(t)} | {area(t)} | {pct(t['armorPen'])} | {pct(t['magicPen'])} | {crit} | {det(t)} | {fmt(single_dps(t))} | {ratio(t):.2f} | {t['ability']} | {t['awaken']} |")
    return "\n".join(rows)

def recipe_table():
    rows = ["| 히든 타워 | 조합식 |", "|------|------|"]
    for t in towers:
        if t.get("recipe"):
            parts = [f"{byid[r]['name']}({GK[byid[r]['grade']][0]})" for r in t["recipe"]]
            rows.append(f"| 💠 {t['name']} | {' + '.join(parts)} |")
    return "\n".join(rows)

def detect_table():
    rows = ["| 등급 | 감지 오라 (주변 투명 몹을 모두에게 드러냄) | 감지 (자신만 공격 가능) |", "|------|------|------|"]
    for g in GRADES:
        aura = [f"{t['name']} r{t['detectRange']:g}" if t['detectRange'] < 50 else f"{t['name']} 맵 전체" for t in towers if t["grade"] == g and t["detect"] == "aura"]
        self_ = [t["name"] for t in towers if t["grade"] == g and t["detect"] == "self"]
        if aura or self_: rows.append(f"| {GK[g]} | {', '.join(aura) or '—'} | {', '.join(self_) or '—'} |")
    return "\n".join(rows)

def mob_table():
    rows = ["| 몹 | 외형 | 등장 | 체력 배율 | 방어력 | 마법 저항 | 속도 | 상태이상 저항 | 목숨 피해 | 보상 | 특수 |",
            "|------|------|------|------|------|------|------|------|------|------|------|"]
    for m in E["mobs"]:
        rows.append(f"| {m['name']} | {m['look']} | {m['fromStage']}단계~ | ×{m['hpMul']:g} | {m['armor']} | {m['magicRes']} | {m['speed']:g} | {pct(m['ccResist'])} | {m['lifeDamage']} | ×{m['rewardMul']:g} | {', '.join(m['traits']) or '—'} |")
    return "\n".join(rows)

def armor_table():
    stages = [15, 30, 50, 100, 150, 200]
    rows = ["| 몹 | " + " | ".join(f"{s}단계 방어/마저 (감소율)" for s in stages) + " |", "|------|" + "------|" * len(stages)]
    for m in E["mobs"]:
        cells = []
        for s in stages:
            a, r = armor_at(m["armor"], s), armor_at(m["magicRes"], s)
            cells.append(f"{a:.0f}/{r:.0f} ({reduction(a)*100:.0f}%/{reduction(r)*100:.0f}%)")
        rows.append(f"| {m['name']} | " + " | ".join(cells) + " |")
    return "\n".join(rows)

def comp_table():
    ids = [m["id"] for m in E["mobs"]]; names = {m["id"]: m["name"] for m in E["mobs"]}
    rows = ["| 단계 | " + " | ".join(names[i] for i in ids) + " |", "|------|" + "------|" * len(ids)]
    for c in E["composition"]:
        a, b = c["stages"]; label = f"{a}~" if b > 1000 else f"{a}~{b}"
        rows.append(f"| {label} | " + " | ".join(str(c["mix"].get(i, "")) for i in ids) + " |")
    return "\n".join(rows)

def boss_table():
    rows = ["| 단계 | 보스 | 외형 | 체력 배율 | 방어력 | 마법 저항 | 속도 | 상태이상 저항 | 투명 | 패턴 |", "|------|------|------|------|------|------|------|------|------|------|"]
    for b in E["bosses"]:
        rows.append(f"| {b['stage']} | **{b['name']}** | {b['look']} | ×{b['hpMul']} | {b['armor']} | {b['magicRes']} | {b['speed']:g} | {pct(b['ccResist'])} | {'👁 필요' if b['invisible'] else '—'} | {b['pattern']} |")
    return "\n".join(rows)

def challenge_table():
    rows = ["| 단계 | 도전 보스 | 외형 | 체력 | 방어력 | 마법 저항 | 보상 | 특수 능력 |", "|------|------|------|------|------|------|------|------|"]
    for c in E["challenges"]:
        rows.append(f"| {c['level']} | {c['name']} | {c['look']} | {c['hp']:,} | {c['armor']} | {c['magicRes']} | {c['reward']:,}원 | {c['ability']} |")
    return "\n".join(rows)

def matchup_table():
    """50단계 골렘·수정 거북 상대로 같은 등급 공격형 타워의 실효 DPS"""
    golem = next(m for m in E["mobs"] if m["id"] == "golem"); turtle = next(m for m in E["mobs"] if m["id"] == "turtle")
    s = 50
    ga, gm = armor_at(golem["armor"], s), armor_at(golem["magicRes"], s)
    ta, tm = armor_at(turtle["armor"], s), armor_at(turtle["magicRes"], s)
    picks = ["duelist", "flamemage", "sniper", "lightning", "swordsaint", "dragoncaller", "spearsgod", "archmage"]
    rows = ["| 타워 | 피해 | 단일 DPS | 골렘(50단계) 실효 | 수정 거북(50단계) 실효 | 골렘 + 관통 강화 30% | 수정 거북 + 관통 강화 30% |", "|------|------|------|------|------|------|------|"]
    for pid in picks:
        t = byid[pid]
        rows.append(f"| {t['name']} | {DMG[t['damageType']]} | {fmt(single_dps(t))} | {fmt(eff_dps(t, ga, gm))} | {fmt(eff_dps(t, ta, tm))} | {fmt(eff_dps(t, ga, gm, 0.30))} | {fmt(eff_dps(t, ta, tm, 0.30))} |")
    return "\n".join(rows)

SECTIONS = {
    "docs/TOWERS.md": {g.upper(): (lambda g=g: tower_table(g)) for g in GRADES} | {"RECIPES": recipe_table, "DETECT": detect_table},
    "docs/ENEMIES.md": {"MOBS": mob_table, "ARMOR": armor_table, "COMP": comp_table, "BOSSES": boss_table, "CHALLENGES": challenge_table},
    "docs/BALANCE.md": {"MATCHUP": matchup_table},
}

if errors:
    print("❌ 데이터 규칙 위반:"); [print("  -", e) for e in errors]
else:
    print(f"✅ 검사 통과: 타워 {len(towers)}종, 몹 {len(E['mobs'])}종, 보스 {len(E['bosses'])}종, 도전 보스 {len(E['challenges'])}종, 감지 타워(노말~레전드) {len(detect)}종")
if "--check" in sys.argv or errors:
    sys.exit(1 if errors else 0)
for doc, secs in SECTIONS.items():
    p = ROOT / doc; s = p.read_text(encoding="utf-8")
    for name, fn in secs.items():
        pat = re.compile(rf"(<!-- GEN:{name} -->\n).*?(<!-- /GEN:{name} -->)", re.S)
        if pat.search(s): s = pat.sub(lambda m: m.group(1) + fn() + "\n" + m.group(2), s)
    p.write_text(s, encoding="utf-8")
print("📝 문서 표 갱신 완료")
