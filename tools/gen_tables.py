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
C = json.load(open(ROOT / "src/data/campaign.json", encoding="utf-8"))
MS = json.load(open(ROOT / "src/data/missions.json", encoding="utf-8"))["missions"]
G = json.load(open(ROOT / "src/data/game.json", encoding="utf-8"))
towers = T["towers"]; BASE = T["baseDps"]
GRADES = ["normal", "rare", "unique", "hero", "legend", "god", "hidden"]
GK = {"normal": "노말", "rare": "레어", "unique": "유니크", "hero": "히어로", "legend": "레전드", "god": "신", "hidden": "히든"}
GS = {"normal": "N", "rare": "R", "unique": "U", "hero": "H", "legend": "L", "god": "G", "hidden": "X"}
SHAPE = {"single": "단일", "melee": "근접 단일", "aoe": "광역", "melee_aoe": "근접 광역", "pierce": "관통", "chain": "연쇄", "multi": "다중", "global": "전체"}
DMG = {"physical": "물리", "magic": "마법", "hybrid": "혼합", "true": "고정"}
FACT = {k: v["name"] for k, v in T["factions"].items()} | {"ancient": "고대신", "alliance": "연합"}
FSHORT = {"modern": "현대군", "kingdom": "왕국", "dwarf": "드워프", "elf": "엘프", "darkelf": "다크 엘프", "orc": "오크·고블린", "fairy": "요정", "ancient": "고대신", "alliance": "연합"}
ELEM = {k: v["name"] for k, v in T["elements"].items()}
EICON = {"fire": "🔥", "lightning": "⚡", "poison": "☠", "ice": "❄", "mud": "🟫", "multi": "🌈"}
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
# 배속 (UI.md 4.2) · 개발자 배속 (T-1): ×1부터 오름차순, 최대 ×16(TickClock 한도), 개발자 목록은 일반 배속을 모두 포함
_sp = [o["mul"] for o in G["speeds"]]; _dev = G.get("devSpeeds", [])
for name, lst in (("speeds", _sp), ("devSpeeds", _dev)):
    if not lst or lst[0] != 1: errors.append(f"game.json {name}: ×1부터 시작해야 함 ({lst})")
    if any(b <= a for a, b in zip(lst, lst[1:])): errors.append(f"game.json {name}: 오름차순이어야 함 ({lst})")
    if any(not isinstance(v, int) or v < 1 or v > 16 for v in lst): errors.append(f"game.json {name}: 1~16 정수만 ({lst})")
# T-2: 사용자 요청 "배속은 2 4 8 16만" → 개발자 순환에 일반 배속 ×3이 없어도 된다 (포함 검사 삭제)
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
mobids = {m["id"] for m in E["mobs"]}
for c in E["composition"] + E.get("formations", []):
    if sum(c["mix"].values()) != 20: errors.append(f"등장 구성 {c.get('stages') or c.get('name')} 합계가 20이 아님")
    for k in c["mix"]:
        if k not in mobids: errors.append(f"등장 구성에 없는 몹 {k}")
from collections import Counter
fc = Counter(t["faction"] for t in towers if t["grade"] in need_special)
if sum(fc.values()) != 50 or None in fc: errors.append(f"종족 배정 누락: {dict(fc)}")
for f, info in T["factions"].items():
    if fc[f] < info["thresholds"][-1]: errors.append(f"{info['name']} 타워 {fc[f]}종 < 최고 시너지 조건 {info['thresholds'][-1]}")
for a, b, _ in T["rivals"]:
    if a not in T["factions"] or b not in T["factions"]: errors.append(f"앙숙 쌍 {a}-{b} 오류")
if len(C["themes"]) != 10: errors.append("캠페인 테마 수가 10이 아님")
H = E["hierarchy"]; LEG = {k: v["name"] for k, v in H["legions"].items()} | {"lord": H["lord"]["guardName"]}
for m in E["mobs"]:
    if not m.get("legion"): errors.append(f"몹 {m['name']} 소속 군단 없음")
capids = {c["id"] for c in H["captains"]}
for k, v in H["legions"].items():
    for c in v["captains"]:
        if c not in capids: errors.append(f"{v['name']} 대장 {c} 정의 없음")
for t in C["themes"]:
    if len(t.get("bossSchedule", {})) != 5: errors.append(f"테마 {t['theme']} 보스 배치 누락")
# F10-2 첫 보스: 무한 모드 단계별 보스 체력 배율은 보스 단계(every의 배수)에만, 0 < 값 ≤ 10
_cyc = E["bossCycle"]
for _k, _v in _cyc.get("stageHpMul", {}).items():
    if not _k.isdigit() or int(_k) % _cyc["every"] != 0: errors.append(f"bossCycle.stageHpMul {_k}: 보스 단계({_cyc['every']}의 배수)가 아님")
    if not (0 < _v <= 10): errors.append(f"bossCycle.stageHpMul {_k}: 배율 {_v} (0 초과 10 이하)")
for b in E["bosses"]:
    if not b.get("counter"): errors.append(f"보스 {b['name']} 대응 한 줄(counter) 없음")
# 판 안 미션 (GDD 8장): 일반 30 + 히든 11, 일반 보상 합계 17,000원 (GDD 3장 경제 표)
normal_m = [m for m in MS if not m["hidden"]]; hidden_m = [m for m in MS if m["hidden"]]
if len(normal_m) != 30: errors.append(f"일반 미션 {len(normal_m)}개 (30개여야 함)")
if len(hidden_m) != 11: errors.append(f"히든 미션 {len(hidden_m)}개 (11개여야 함)")
if sum(m["reward"] for m in normal_m) != 17000: errors.append(f"일반 미션 보상 합계 {sum(m['reward'] for m in normal_m)} (GDD 3장 17,000원)")
if len({m["id"] for m in MS}) != len(MS): errors.append("미션 id 중복")
for m in MS:
    for tid in m["cond"].get("towers", []):
        if tid not in byid: errors.append(f"미션 {m['id']} 타워 {tid} 없음")
# 도전 보스 (GDD 6장): 체력 = 2700 × 2.2^(n-1) (표의 반올림 범위 ±1%), 단계 순서
for i, c in enumerate(E["challenges"]):
    want = 2700 * 2.2 ** i
    if c["level"] != i + 1: errors.append(f"도전 보스 {c['name']} 단계 {c['level']} (차례로 {i+1})")
    if abs(c["hp"] - want) > want * 0.01: errors.append(f"도전 보스 {c['name']} 체력 {c['hp']} (공식 {want:.0f})")

# 캐릭터 설명 (HF-2): 타워마다 lore·role 한 문장 (정보 패널·캐릭터 카드)
for t in towers:
    for k in ("lore", "role"):
        v = (t.get(k) or "").strip()
        if not v: errors.append(f"{t['name']} {k} 없음 (캐릭터 설명 한 문장)")
        elif not re.search(r"[.!?]$", v): errors.append(f"{t['name']} {k}: 마침표로 끝나는 한 문장이어야 함 ({v})")
        elif re.search(r"[.!?]\s", v[:-1]): errors.append(f"{t['name']} {k}: 한 문장이어야 함 ({v})")
        elif len(v) > 80: errors.append(f"{t['name']} {k}: 80자 이하 ({len(v)}자)")
# 캐릭터별 화면 크기 (HF-2, characterLooks.json scale 0.6~1.6): 타워(각성 포함)·적 모두
LK = json.load(open(ROOT / "src/data/characterLooks.json", encoding="utf-8"))["characters"]
look_t = {c["id"]: c for c in LK if c["kind"] == "tower"}
look_e = {c["id"]: c for c in LK if c["kind"] in ("mob", "captain", "commander", "lord")}
def _scale_ok(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and 0.6 <= v <= 1.6
for t in towers:
    c = look_t.get(t["id"])
    if not c: errors.append(f"{t['name']} 외형(characterLooks) 없음"); continue
    if not _scale_ok(c.get("scale")): errors.append(f"{t['name']} 화면 크기 scale {c.get('scale')} (0.6~1.6)")
    if "awaken" in c and "scale" in c["awaken"] and not _scale_ok(c["awaken"]["scale"]): errors.append(f"{t['name']} 각성 화면 크기 {c['awaken']['scale']} (0.6~1.6)")
for i, c in look_e.items():
    if not _scale_ok(c.get("scale")): errors.append(f"적 {c['name']} 화면 크기 scale {c.get('scale')} (0.6~1.6)")
# 그림 설정 (HF-2, game.json art): 배경 테마×밴드·컷인·타이틀 그림 파일이 모두 있어야 함
ART = G.get("art", {})
_assets = ROOT / "public/assets"
for th in range(1, ART.get("themes", 0) + 1):
    for b in range(1, ART.get("bands", 0) + 1):
        if not (_assets / f"backgrounds/bg_t{th:02d}_b{b}.webp").exists(): errors.append(f"배경 그림 없음: bg_t{th:02d}_b{b}.webp")
for cid in ART.get("cutins", []):
    if not (_assets / f"cutins/cutin_{cid}.webp").exists(): errors.append(f"컷인 그림 없음: cutin_{cid}.webp")
for n in range(1, ART.get("titleArts", 0) + 1):
    if not (_assets / f"title/title_keyart_{n}.webp").exists(): errors.append(f"타이틀 그림 없음: title_keyart_{n}.webp")
if ART.get("themes", 0) > len(C["themes"]): errors.append(f"art.themes {ART.get('themes')} > 캠페인 테마 수 {len(C['themes'])}")

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
    rows = ["| 타워 | 구분 | 종족 | 원소 | 피해 | 물리 공격력 | 마법 공격력 | 공속 | 사거리 | 공격 범위 | 방어 관통 | 마법 관통 | 치명타 | 감지 | 단일 DPS | 전투력 지수 | 특수 능력 (Lv1 → Lv15) | 각성 |",
            "|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|------|"]
    for t in [x for x in towers if x["grade"] == g]:
        name = ("★ **" + t["name"] + "**") if t["special"] and g not in ("god", "hidden") else t["name"]
        if g == "god": name = "👑 " + t["name"]
        if g == "hidden": name = "💠 " + t["name"]
        unlock = {"base": "기본", "unlock": "해금", "god": "0.01%", "recipe": "조합"}[t["unlock"]]
        dmgtype = DMG[t["damageType"]]
        atk = fmt(t["atk"]) if t["damageType"] != "true" else f"고정 {fmt(t['tatk'])}"
        crit = f"{t['crit']*100:.0f}% ×{t['critMul']:g}" if t["crit"] else "—"
        el = (EICON[t["element"]] + ELEM[t["element"]]) if t.get("element") else "—"
        rows.append(f"| {name} | {unlock} | {FSHORT.get(t['faction'], '—')} | {el} | {dmgtype} | {atk} | {fmt(t['matk'])} | {t['aps']:g} | {rng(t)} | {area(t)} | {pct(t['armorPen'])} | {pct(t['magicPen'])} | {crit} | {det(t)} | {fmt(single_dps(t))} | {ratio(t):.2f} | {t['ability']} | {t['awaken']} |")
    return "\n".join(rows)

def recipe_table():
    rows = ["| 히든 타워 | 조합식 (N 노말 · R 레어 · U 유니크 · H 히어로 · L 레전드) |", "|------|------|"]
    for t in towers:
        if t.get("recipe"):
            parts = [f"{byid[r]['name']}({GS[byid[r]['grade']]})" for r in t["recipe"]]
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
    rows = ["| 몹 | 군단 | 외형 | 등장 | 체력 배율 | 방어력 | 마법 저항 | 속도 | 상태이상 저항 | 목숨 피해 | 보상 | 특수 |",
            "|------|------|------|------|------|------|------|------|------|------|------|------|"]
    for m in E["mobs"]:
        frm = "분열 시" if m.get("spawnOnly") else f"{m['fromStage']}단계~"
        nm = ("⭐ " + m["name"]) if m.get("special") else m["name"]
        rows.append(f"| {nm} | {LEG[m['legion']]} | {m['look']} | {frm} | ×{m['hpMul']:g} | {m['armor']} | {m['magicRes']} | {m['speed']:g} | {pct(m['ccResist'])} | {m['lifeDamage']} | ×{m['rewardMul']:g} | {', '.join(m['traits']) or '—'} |")
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
    ids = [m["id"] for m in E["mobs"] if not m.get("spawnOnly")]; names = {m["id"]: m["name"] for m in E["mobs"]}
    rows = ["| 단계 | " + " | ".join(names[i] for i in ids) + " |", "|------|" + "------|" * len(ids)]
    for c in E["composition"]:
        a, b = c["stages"]; label = f"{a}~" if b > 1000 else f"{a}~{b}"
        rows.append(f"| {label} | " + " | ".join(str(c["mix"].get(i, "")) for i in ids) + " |")
    return "\n".join(rows)

def boss_table():
    rows = ["| 기본 단계 | 보스 | 계급 · 군단 | 외형 | 체력 배율 | 방어력 | 마법 저항 | 속도 | 상태이상 저항 | 투명 | 패턴 | 대응 (예고·패배 화면) |", "|------|------|------|------|------|------|------|------|------|------|------|------|"]
    for b in E["bosses"]:
        rows.append(f"| {b['stage']} | **{b['name']}** | {b['rank']} · {LEG[b['legion']]} | {b['look']} | ×{b['hpMul']} | {b['armor']} | {b['magicRes']} | {b['speed']:g} | {pct(b['ccResist'])} | {'👁 필요' if b['invisible'] else '—'} | {b['pattern']} | {b['counter']} |")
    cyc = E["bossCycle"]
    for k, v in sorted(cyc.get("stageHpMul", {}).items(), key=lambda kv: int(kv[0])):
        rows.append("")
        rows.append(f"- 무한 모드 **{k}단계** 보스만 체력 ×{v:g} (`bossCycle.stageHpMul`, F10-2 첫 보스 밸런스). 순환으로 다시 나오는 같은 보스는 원래 식.")
    return "\n".join(rows)

def challenge_table():
    rows = ["| 단계 | 도전 보스 | 외형 | 체력 | 방어력 | 마법 저항 | 보상 | 특수 능력 |", "|------|------|------|------|------|------|------|------|"]
    for c in E["challenges"]:
        rows.append(f"| {c['level']} | {c['name']} | {c['look']} | {c['hp']:,} | {c['armor']} | {c['magicRes']} | {c['reward']:,}원 | {c['ability']} |")
    return "\n".join(rows)

def matchup_table():
    """50단계 암흑 골렘·수정 거북 상대로 같은 등급 공격형 타워의 실효 DPS"""
    golem = next(m for m in E["mobs"] if m["id"] == "golem"); turtle = next(m for m in E["mobs"] if m["id"] == "turtle")
    s = 50
    ga, gm = armor_at(golem["armor"], s), armor_at(golem["magicRes"], s)
    ta, tm = armor_at(turtle["armor"], s), armor_at(turtle["magicRes"], s)
    picks = ["duelist", "flamemage", "sniper", "lightning", "swordsaint", "dragoncaller", "spearsgod", "archmage"]
    rows = ["| 타워 | 피해 | 단일 DPS | 암흑 골렘(50단계) 실효 | 수정 거북(50단계) 실효 | 암흑 골렘 + 관통 강화 30% | 수정 거북 + 관통 강화 30% |", "|------|------|------|------|------|------|------|"]
    for pid in picks:
        t = byid[pid]
        rows.append(f"| {t['name']} | {DMG[t['damageType']]} | {fmt(single_dps(t))} | {fmt(eff_dps(t, ga, gm))} | {fmt(eff_dps(t, ta, tm))} | {fmt(eff_dps(t, ga, gm, 0.30))} | {fmt(eff_dps(t, ta, tm, 0.30))} |")
    return "\n".join(rows)

def faction_table():
    rows = ["| 종족 | 타워 (N·R·U·H·L = 노말·레어·유니크·히어로·레전드) | 수 | 시너지 (판 위 서로 다른 타워 종류 수) |", "|------|------|------|------|"]
    for f, info in T["factions"].items():
        mem = [f"{t['name']}({GS[t['grade']]})" for t in towers if t["faction"] == f]
        syn = " / ".join(f"{n}종: {b}" for n, b in zip(info["thresholds"], info["bonus"]))
        rows.append(f"| **{info['name']}** | {', '.join(mem)} | {len(mem)} | {syn} |")
    return "\n".join(rows)

def rival_table():
    rows = ["| 앙숙 | 이유 | 효과 |", "|------|------|------|"]
    for a, b, why in T["rivals"]:
        rows.append(f"| {FSHORT[a]} ↔ {FSHORT[b]} | {why} | 주변 8칸에 서로 붙어 있으면 둘 다 공격속도 +8% (\"질 수 없지!\") |")
    return "\n".join(rows)

def element_table():
    rows = ["| 원소 | 대표 효과 | 타워 |", "|------|------|------|"]
    for e, info in T["elements"].items():
        mem = [t["name"] for t in towers if t.get("element") == e]
        rows.append(f"| {EICON[e]} {info['name']} | {info['effect']} | {', '.join(mem)} |")
    return "\n".join(rows)

def formation_table():
    names = {m["id"]: m["name"] for m in E["mobs"]}
    rows = ["| 편대 | 구성 (20칸, 암흑 고블린 떼는 1칸 = 3마리) | 무한 모드 등장 | 왜 어려운가 | 대응 |", "|------|------|------|------|------|"]
    for f in E["formations"]:
        mix = ", ".join(f"{names[k]} {v}" for k, v in f["mix"].items())
        rows.append(f"| **{f['name']}** | {mix} | {f['from']}단계~ | {f['why']} | {f['counter']} |")
    return "\n".join(rows)

def hierarchy_table():
    names = {m["id"]: m["name"] for m in E["mobs"]}; cap = {c["id"]: c["name"] for c in H["captains"]}
    rows = ["| 군단 | 특징 | 군단장 (4천왕) | 대장 | 하수인 |", "|------|------|------|------|------|"]
    for k, v in H["legions"].items():
        rows.append(f"| **{v['name']}** | {v['theme']} | {v['commander']['name']} | {', '.join(cap[c] for c in v['captains'])} | {', '.join(names[m] for m in v['minions'])} |")
    rows.append(f"| **{H['lord']['guardName']}** | 군주의 친위 | — | {', '.join(cap[c] for c in H['lord']['guard'])} | — |")
    return "\n".join(rows)

def commander_table():
    rows = ["| 계급 | 이름 | 외형 | 체력 배율 | 방어력 | 마법 저항 | 속도 | 패턴 | 대사 |", "|------|------|------|------|------|------|------|------|------|"]
    L = H["lord"]
    rows.append(f"| 👑 군주 | **{L['name']}** | {L['look']} | ×{L['hpMul']} | {L['armor']} | {L['magicRes']} | {L['speed']:g} | {' / '.join(L['phases'])} | \"{L['line']}\" |")
    for k, v in H["legions"].items():
        c = v["commander"]
        rows.append(f"| ⭐ 4천왕 | **{c['name']}** | {c['look']} | ×{c['hpMul']} | {c['armor']} | {c['magicRes']} | {c['speed']:g} | {c['pattern']} | \"{c['line']}\" |")
    return "\n".join(rows)

def captain_table():
    rows = ["| 대장 | 군단 | 외형 | 패턴 | 등장 |", "|------|------|------|------|------|"]
    for c in H["captains"]:
        rows.append(f"| {c['name']} | {LEG[c['legion']]} | {c['look']} | {c['pattern']} | {c['appears']} |")
    return "\n".join(rows)

def schedule_table():
    rows = ["| 테마 | 10단계 | 20단계 | 30단계 | 40단계 (투명) | 50단계 (최종) |", "|------|------|------|------|------|------|"]
    for t in C["themes"]:
        b = t["bossSchedule"]; fin = b["50"]
        if t["finalBoss"].get("rank") in ("4천왕", "4천왕 ×4"): fin = f"⭐ **{fin}**"
        if t["finalBoss"].get("rank") == "군주": fin = f"👑 **{fin}**"
        rows.append(f"| {t['theme']} {t['name']} | {b['10']} | {b['20']} | {b['30']} | {b['40']} | {fin} |")
    return "\n".join(rows)

def theme_table():
    rows = ["| 테마 | 이름 | 지역 | 해방 종족 | 맵 | 특수 규칙 | 최종 보스 (50단계) | 체력 배율 | 방어 +| 특수 몹 앞당김 |", "|------|------|------|------|------|------|------|------|------|------|"]
    for t in C["themes"]:
        rows.append(f"| {t['theme']} | **{t['name']}** | {t['region']} | {FSHORT.get(t['faction'], t['faction'])} | {t['mapName']} | {t['gimmick']} | [{t['finalBoss'].get('rank','')}] {t['finalBoss']['name']}: {t['finalBoss']['pattern']} | ×{t['hpMul']:g} | +{t['armorOffset']} | {t['specialOffset']}단계 |")
    return "\n".join(rows)

def reward_table():
    r = C["checkpointRewards"]
    rows = ["| 테마 | 10단계 | 20단계 | 30단계 | 40단계 | 50단계 (테마 클리어) | 테마 합계 💎 |", "|------|------|------|------|------|------|------|"]
    for t in range(1, 11):
        cells = []; tot = 0
        for k, base in (("10", 20), ("20", 30), ("30", 40), ("40", 50), ("50", 150)):
            g = base * t; tot += g
            cells.append(f"💎{g} + {', '.join(r[k]['items'][:2])}")
        rows.append(f"| {t} | " + " | ".join(cells) + f" | {tot:,} |")
    return "\n".join(rows)

# ---------- 맵 (T-3: 배치 칸은 모두 2×2 블록, docs/MAPS.md) ----------
MAPS = {p.stem: json.load(open(p, encoding="utf-8")) for p in sorted((ROOT / "src/data/maps").glob("*.json"))}
MAP_BLOCK = 2
def route_cells(m, inmap=True):
    """경로가 지나는 칸 (지나는 순서, 교차점은 두 번). inmap이면 맵 밖 등장·퇴장 칸은 뺀다."""
    out = []
    wp = m["waypoints"]
    for i in range(1, len(wp)):
        (ax, ay), (bx, by) = wp[i - 1], wp[i]
        dx, dy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
        x, y = ax, ay
        while True:
            if not out or out[-1] != (x, y): out.append((x, y))
            if (x, y) == (bx, by): break
            x += dx; y += dy
    if m.get("loop") and out and out[0] == out[-1]: out.pop()
    if inmap: out = [c for c in out if 0 <= c[0] < m["width"] and 0 <= c[1] < m["height"]]
    return out
def coverage(m, x, y, r):
    return sum(1 for (px, py) in route_cells(m) if (px - x) ** 2 + (py - y) ** 2 <= r * r)
for mid, m in MAPS.items():
    tiles, owner = m["tiles"], {}
    field = m.get("layout") == "field"  # G-1: 큰 마당 둘레를 적이 도는 맵 — 마당은 2×2 이상 직사각형
    for name, b in m["blocks"].items():
        if (b["w"] < MAP_BLOCK or b["h"] < MAP_BLOCK) if field else (b["w"], b["h"]) != (MAP_BLOCK, MAP_BLOCK):
            errors.append(f"maps/{mid}.json 블록 {name}: {MAP_BLOCK}×{MAP_BLOCK}이어야 함 ({b['w']}×{b['h']})"); continue
        for y in range(b["y"], b["y"] + b["h"]):
            for x in range(b["x"], b["x"] + b["w"]):
                ch = tiles[y][x] if 0 <= y < len(tiles) and 0 <= x < len(tiles[y]) else None
                if ch != "B": errors.append(f"maps/{mid}.json 블록 {name}: [{x},{y}]이 B가 아님 ({ch})")
                if (x, y) in owner: errors.append(f"maps/{mid}.json 블록 {name}: {owner[(x, y)]}와 겹침 [{x},{y}]")
                owner[(x, y)] = name
    touching = set()
    for (x, y), n in owner.items():
        for dx, dy in ((1, 0), (0, 1)):
            o = owner.get((x + dx, y + dy))
            if o is not None and o != n: touching.add("·".join(sorted((n, o))))
    for pair in sorted(touching): errors.append(f"maps/{mid}.json 블록 {pair}가 맞닿음 (길·빈 땅으로 떨어뜨릴 것)")
    stray = [(x, y) for y, row in enumerate(tiles) for x, ch in enumerate(row) if ch == "B" and (x, y) not in owner]
    if stray: errors.append(f"maps/{mid}.json 블록 밖 배치 칸 {len(stray)}개: {stray[:6]}")
    nb = sum(row.count("B") for row in tiles)
    if nb != m["buildableCount"]: errors.append(f"maps/{mid}.json buildableCount {m['buildableCount']} ≠ 실제 B {nb}")
    if m["mode"] == "stage" and m["turns"] < 5: errors.append(f"maps/{mid}.json 스테이지 맵 회전 {m['turns']}번 (5번 이상)")
    if not field and len(m["blocks"]) < 5: errors.append(f"maps/{mid}.json 블록 {len(m['blocks'])}개 (5개 이상 — G-1 큰 칸)")
    if field and not m.get("loop"): errors.append(f"maps/{mid}.json 마당 맵은 길이 마당 둘레를 도는 loop여야 함")

def maplist_table():
    rows = ["| 맵 | 모드 | 크기 | 2×2 블록 | 배치 칸 | 경로 길이 | 회전 | 교차 |", "|------|------|------|------|------|------|------|------|"]
    for mid, m in MAPS.items():
        mode = "무한 (순환)" if m["mode"] == "infinite" else "스테이지"
        rows.append(f"| {m['name']} (`{mid}`) | {mode} | {m['width']}×{m['height']} | {len(m['blocks'])}개 | **{m['buildableCount']}칸** | {m['pathLength']}칸 | {m['turns']}번 | {len(m['crossings'])}곳 |")
    return "\n".join(rows)
def tiles_block(mid):
    m = MAPS[mid]
    bname = {}
    for name, b in m["blocks"].items(): bname[(b["x"], b["y"])] = name[0]
    lines = ["```", "     x: " + " ".join(str(x % 10) for x in range(m["width"]))]
    for y, row in enumerate(m["tiles"]):
        cells = []
        for x, ch in enumerate(row):
            cells.append("·" if ch == "X" else ch)
        lines.append(f"y={y:2d}    " + " ".join(cells))
    lines.append("```")
    return "\n".join(lines)
def cover_block(mid, r):
    m = MAPS[mid]
    lines = ["```"]
    for y, row in enumerate(m["tiles"]):
        lines.append(" ".join(f"{coverage(m, x, y, r):2d}" if ch == "B" else " ·" for x, ch in enumerate(row)))
    lines.append("```")
    return "\n".join(lines)
def block_table(mid):
    m = MAPS[mid]
    path = set(route_cells(m))
    rows = ["| 블록 | 칸 | 경로가 닿는 면 | 사거리 2.5 평균 커버리지 | 사거리 1.5 평균 |", "|------|------|------|------|------|"]
    for name, b in m["blocks"].items():
        cells = [(x, y) for y in range(b["y"], b["y"] + b["h"]) for x in range(b["x"], b["x"] + b["w"])]
        sides = sum(1 for side in (
            [(x, b["y"] - 1) for x in range(b["x"], b["x"] + b["w"])],
            [(x, b["y"] + b["h"]) for x in range(b["x"], b["x"] + b["w"])],
            [(b["x"] - 1, y) for y in range(b["y"], b["y"] + b["h"])],
            [(b["x"] + b["w"], y) for y in range(b["y"], b["y"] + b["h"])]) if any(c in path for c in side))
        c25 = sum(coverage(m, x, y, 2.5) for x, y in cells) / len(cells)
        c15 = sum(coverage(m, x, y, 1.5) for x, y in cells) / len(cells)
        rows.append(f"| {name} | ({b['x']},{b['y']})~({b['x'] + 1},{b['y'] + 1}) | {sides}면 | {c25:.1f} | {c15:.1f} |")
    return "\n".join(rows)

def map_table():
    rows = ["| 테마 | 맵 | 구조 | 배경 |", "|------|------|------|------|"]
    for t in C["themes"]:
        rows.append(f"| {t['theme']} | {t['mapName']} (`{t['mapId']}`) | {t['mapConcept']} | {t['background']} |")
    return "\n".join(rows)

SECTIONS = {
    "docs/TOWERS.md": {g.upper(): (lambda g=g: tower_table(g)) for g in GRADES} | {"RECIPES": recipe_table, "DETECT": detect_table, "FACTIONS": faction_table, "RIVALS": rival_table, "ELEMENTS": element_table},
    "docs/ENEMIES.md": {"MOBS": mob_table, "ARMOR": armor_table, "COMP": comp_table, "BOSSES": boss_table, "CHALLENGES": challenge_table, "FORMATIONS": formation_table, "HIERARCHY": hierarchy_table, "COMMANDERS": commander_table, "CAPTAINS": captain_table},
    "docs/CAMPAIGN.md": {"THEMES": theme_table, "REWARDS": reward_table, "MAPS": map_table, "SCHEDULE": schedule_table},
    "docs/BALANCE.md": {"MATCHUP": matchup_table},
    "docs/MAPS.md": {"MAPLIST": maplist_table} | {f"TILES_{k.upper()}": (lambda k=k: tiles_block(k)) for k in MAPS}
        | {f"COVER25_{k.upper()}": (lambda k=k: cover_block(k, 2.5)) for k in MAPS} | {f"COVER15_{k.upper()}": (lambda k=k: cover_block(k, 1.5)) for k in MAPS}
        | {f"BLOCKS_{k.upper()}": (lambda k=k: block_table(k)) for k in MAPS},
}

if errors:
    print("❌ 데이터 규칙 위반:"); [print("  -", e) for e in errors]
else:
    print(f"✅ 검사 통과: 타워 {len(towers)}종, 종족 {len(T['factions'])}개, 몹 {len(E['mobs'])}종, 편대 {len(E['formations'])}개, 테마 {len(C['themes'])}개, 보스 {len(E['bosses'])}종, 도전 보스 {len(E['challenges'])}종, 미션 {len(MS)}개, 감지 타워(노말~레전드) {len(detect)}종, 배속 {_sp} · 개발자 {_dev}, 캐릭터 설명·크기 {len(towers)}+{len(look_e)}, 배경 {ART.get('themes',0)}×{ART.get('bands',0)} · 컷인 {len(ART.get('cutins',[]))}, 맵 {len(MAPS)}개(2×2 블록 · 배치 칸 {', '.join(f"{k} {m['buildableCount']}" for k, m in MAPS.items())})")
if "--check" in sys.argv or errors:
    sys.exit(1 if errors else 0)
for doc, secs in SECTIONS.items():
    p = ROOT / doc; s = p.read_text(encoding="utf-8")
    for name, fn in secs.items():
        pat = re.compile(rf"(<!-- GEN:{name} -->\n).*?(<!-- /GEN:{name} -->)", re.S)
        if pat.search(s): s = pat.sub(lambda m: m.group(1) + fn() + "\n" + m.group(2), s)
    p.write_text(s, encoding="utf-8")
print("📝 문서 표 갱신 완료")
