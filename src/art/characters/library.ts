/**
 * 절차 생성 캐릭터 라이브러리의 이름 목록 (순수 데이터, Phaser·DOM 없음).
 *
 * `src/data/characterLooks.json`의 각 필드는 여기 목록 중 하나여야 한다 (looks.ts가 검사).
 * 새 체형·머리 장식·소품을 추가할 때: ① 여기 목록에 이름 추가 ② 해당 그리기 파일(headgear.ts·props.ts …)의 표에 그리기 함수 추가
 * → 표에 빠진 이름이 있으면 단위 테스트(characterArt.test.ts)가 실패한다.
 */

/** 캐릭터 종류 (디자인 시트 kind) */
export const CHARACTER_KINDS = ['tower', 'mob', 'captain', 'commander', 'lord', 'advisor', 'sidekick'] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

/** 사람형 체형 */
export const BODIES = [
  'normal', // 보통 사람 (왕국·현대군)
  'stout', // 작고 다부짐 (드워프)
  'slim', // 늘씬함 (엘프·다크 엘프)
  'small', // 아이·고블린 (머리 크고 몸 작음)
  'bulky', // 큰 덩치 (오크 전사)
  'fairy', // 아주 작음 + 떠 있음 (요정 — 날개는 back)
  'stone', // 돌 몸 (돌 골렘)
  'deity', // 신 (긴 옷자락, 조금 더 큼)
  'spirit', // 바람·번개로 된 몸 (다리 없이 소용돌이)
] as const;
export type BodyId = (typeof BODIES)[number];

/** 옷 모양 */
export const OUTFITS = [
  'tunic',
  'robe',
  'armor',
  'leather',
  'vest',
  'coat',
  'suit',
  'dress',
  'fur',
  'apron',
  'toga',
  'ninja',
  'ghillie',
  'gi',
  'rock',
  'storm',
] as const;
export type OutfitId = (typeof OUTFITS)[number];

export const HAIR_STYLES = ['none', 'short', 'long', 'spiky', 'ponytail', 'bun', 'static', 'wild', 'bob', 'mohawk', 'twintail', 'topknot', 'slick', 'flowing', 'tuft', 'flame'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const BEARDS = ['none', 'short', 'braided', 'long', 'mustache', 'big'] as const;
export type BeardId = (typeof BEARDS)[number];

export const EARS = ['human', 'elf', 'darkelf', 'goblin', 'orc', 'fairy', 'none'] as const;
export type EarId = (typeof EARS)[number];

/** 표정 */
export const FACES = ['smile', 'grin', 'determined', 'calm', 'closed', 'angry', 'wink', 'smug', 'focused', 'masked', 'shadow', 'cheer', 'skull', 'stern'] as const;
export type FaceId = (typeof FACES)[number];

export const EYEWEAR = ['none', 'glasses', 'sunglasses', 'goggles', 'goggles_up', 'visor', 'third_eye', 'monocle'] as const;
export type EyewearId = (typeof EYEWEAR)[number];

/** 머리 장식 */
export const HEADGEAR = [
  'none',
  'mining_helmet',
  'bone_headband',
  'wizard_hat',
  'kettle_helmet',
  'knight_helmet',
  'army_helmet',
  'helmet_goggles',
  'wide_hat',
  'tribal_mask',
  'feather_cap',
  'cap',
  'hood',
  'bandana',
  'goggles_cap',
  'circlet',
  'tiara',
  'fedora',
  'headband',
  'feather_crown',
  'top_hat',
  'ghillie_hood',
  'ninja_hood',
  'cowl',
  'beret_headset',
  'beret',
  'great_helm',
  'horn_helmet',
  'star_hat',
  'deep_hood',
  'laurel',
  'veil',
  'sun_crown',
  'wheat_crown',
  'thorn_crown',
  'crown',
  'winged_helm',
  'skull_crown',
  'party_crown',
  'flame_crown',
  'ice_crown',
  'lightning_crown',
  'dragon_helm',
  'leaf_hood',
  'clover_crown',
  'clock_crown',
] as const;
export type HeadgearId = (typeof HEADGEAR)[number];

/** 머리 장식 덧붙임 (각성 등) */
export const HEAD_DECOS = ['none', 'gem', 'stars', 'moon', 'jewels', 'feather'] as const;
export type HeadDeco = (typeof HEAD_DECOS)[number];

/** 주 소품 (오른손, 대기 동작으로 움직이는 파츠) */
export const PROPS = [
  'none',
  'pickaxe',
  'drumsticks',
  'dagger',
  'twin_daggers',
  'longbow',
  'wand',
  'crystal_staff',
  'short_sword',
  'longsword',
  'spear',
  'spear_banner',
  'boulder',
  'shuriken',
  'radio',
  'money_bag',
  'scales',
  'mud_totem',
  'lute',
  'tablet',
  'sat_tablet',
  'fireball',
  'cleaver',
  'machine_gun',
  'minigun',
  'bombs',
  'leaf_bow',
  'ice_staff',
  'dice',
  'hammer',
  'carved_staff',
  'skull_staff',
  'crystal_ball',
  'ledger',
  'sniper_rifle',
  'railgun',
  'twin_axes',
  'spark_orb',
  'venom_arrow',
  'viper_bow',
  'rune_staff',
  'thick_book',
  'pocket_watch',
  'flask',
  'tower_shield',
  'skull',
  'scythe',
  'binoculars',
  'katana',
  'arrows',
  'dragon_staff',
  'war_banner',
  'spellbook',
  'twin_blades',
  'clover',
  'giant_spear',
  'storm_staff',
  'fan',
  'prayer',
  'portal',
  'fate_wheel',
  'horn_of_plenty',
  'dark_orb',
  'element_orbs',
  'juggle_mix',
  'star_bow',
  'legion_banner',
  'gold_sword',
  'clock_staff',
  'goblin_scepter',
  'gold_cannon',
  'dice_orb',
  'chain_lightning',
  'meditate',
  'baton',
] as const;
export type PropId = (typeof PROPS)[number];

/** 왼손 소품 (몸 파츠에 고정) */
export const OFFHANDS = ['none', 'round_shield', 'lion_shield', 'kite_shield', 'mud_ball', 'hourglass', 'radio', 'coin', 'gold_nugget'] as const;
export type OffhandId = (typeof OFFHANDS)[number];

/** 몸 앞 장식 */
export const FRONTS = ['none', 'drum', 'drum_flame', 'scarf', 'muffler', 'belt_pouch', 'ammo_belt', 'coin_belt', 'bone_necklace', 'emblem', 'card_vest', 'sash', 'tie'] as const;
export type FrontId = (typeof FRONTS)[number];

/** 등 뒤 (날개·망토 — 날갯짓·펄럭임 파츠) */
export const BACKS = [
  'none',
  'quiver',
  'quiver_leaf',
  'quiver_smoke',
  'cape',
  'cape_emblem',
  'cape_cards',
  'cape_storm',
  'cape_gold',
  'cape_stars',
  'wings_butterfly',
  'wings_note',
  'wings_ice',
  'wings_star',
  'wings_clock',
  'wings_clover',
  'wings_feather',
  'wings_bat',
  'wings_storm',
  'wings_void',
  'wings_blade',
  'greatsword',
  'storm_cloud',
  'halo',
  'light_halo',
  'clock_halo',
  'ring_device',
  'floating_blades',
  'ghost_soldiers',
  'shadow_clones',
  'dragons',
  'meteors',
  'cathedral_halo',
  'eye_halo',
  'gold_wings',
] as const;
export type BackId = (typeof BACKS)[number];

/** 발밑 (몸 파츠에 고정) */
export const GROUNDS = ['none', 'anvil', 'anvil_flame', 'coin_pile', 'gold_throne', 'coin_throne', 'magic_circle', 'magic_circle_big', 'wind_swirl', 'cloud'] as const;
export type GroundId = (typeof GROUNDS)[number];

/** 동반자 (따로 움직이는 파츠) */
export const PETS = ['none', 'dog', 'dogs_armored', 'drone', 'drones2', 'spirit', 'spirits2', 'baby_dragon', 'mud_spirit', 'goblins', 'skeletons'] as const;
export type PetId = (typeof PETS)[number];

/** 떠다니는 작은 입자 (공유 텍스처) */
export const FX = ['none', 'dust', 'notes', 'smoke', 'coins', 'flames', 'leaves', 'snow', 'sparks', 'stars', 'bubbles', 'steam', 'green_flames', 'petals', 'lightning', 'clover', 'fruit', 'gold_fruit', 'confetti', 'mist', 'meteors', 'hearts'] as const;
export type FxId = (typeof FX)[number];

/** 오라 (몸 뒤 은은한 빛, 공유 텍스처) */
export const AURAS = ['none', 'glow', 'gold', 'silver', 'frost', 'flame', 'shadow', 'holy', 'rainbow', 'blackgold', 'storm', 'poison', 'nox'] as const;
export type AuraId = (typeof AURAS)[number];

/** 대기 동작 프리셋 (TOWERS.md 11장) — idle.ts의 표와 같은 이름 */
export const IDLES = [
  'dig',
  'drum',
  'hop',
  'draw_bow',
  'wand_blink',
  'swing',
  'spin_prop',
  'dust_off',
  'pet_dog',
  'count_coins',
  'shake_totem',
  'strum',
  'drone_launch',
  'palm_roll',
  'stretch',
  'twirl',
  'polish',
  'juggle',
  'windblown',
  'breath_frost',
  'toss',
  'hammer',
  'staff_thump',
  'gaze',
  'write',
  'aim',
  'fume',
  'static',
  'dip',
  'draw_circle',
  'read',
  'watch',
  'shake_flask',
  'guard',
  'pet_skull',
  'scout_look',
  'meditate',
  'iai',
  'arrange',
  'play_pet',
  'wave_banner',
  'float_read',
  'fade',
  'toss_clover',
  'hold_upright',
  'storm',
  'fan',
  'pray',
  'portal',
  'wheel',
  'pour',
  'wings_spread',
  'orbit',
  'command',
  'cheer',
  'sway',
  'dance',
  'hover',
  'walk',
  'flap',
  'float',
  'slither',
] as const;
export type IdleId = (typeof IDLES)[number];

/** 적 몸 모양 (32종 모두 다른 그림) */
export const CREATURES = [
  'slime',
  'bat',
  'dark_golem',
  'crystal_turtle',
  'sheet_ghost',
  'split_slime',
  'shadow_thief',
  'spore_healer',
  'skeleton_shield',
  'smoke_wolf',
  'goblin_pack',
  'gem_golem',
  'mini_golem',
  'spike_knight',
  'bat_queen',
  'sand_worm',
  'frost_wyrm',
  'rune_giant',
  'crystal_worm',
  'steel_colossus',
  'lava_giant',
  'king_slime',
  'rot_treant',
  'abyss_jelly',
  'wraith_lord',
  'wraith_rider',
  'chaos_dragon',
  'blade_lady',
  'rock_heart',
  'rot_king',
  'shadow_assassin',
  'dark_lord',
] as const;
export type CreatureId = (typeof CREATURES)[number];

/** 적 계급 (ART.md 1.5) */
export const RANKS = ['minion', 'captain', 'commander', 'lord'] as const;
export type RankId = (typeof RANKS)[number];

/** 녹스 군단 (enemies.json hierarchy.legions 키 + 군주 직속) */
export const LEGIONS = ['gale', 'earth', 'plague', 'shadow', 'lord'] as const;
export type LegionId = (typeof LEGIONS)[number];

/** 적 움직임 (MobSprite 걷기 자세) */
export const MOTIONS = ['walk', 'flap', 'float', 'slither'] as const;
export type MotionId = (typeof MOTIONS)[number];

/** 인물 초상 특징 (조언자·미오·총지휘관) */
export const PORTRAIT_ITEMS = ['tablet', 'sword', 'hammer', 'golden_bow', 'crystal_tiara', 'fur_mantle', 'butterfly', 'drone', 'baton'] as const;
export type PortraitItem = (typeof PORTRAIT_ITEMS)[number];

/** 옷 무늬·장식 (여러 개 가능) */
export const OUTFIT_DECOS = ['crystals', 'runes', 'card_suits', 'stars', 'lightning', 'phoenix', 'flames', 'lion', 'moss', 'leaves', 'frost', 'skulls', 'gold_trim', 'cosmic'] as const;
export type OutfitDeco = (typeof OUTFIT_DECOS)[number];
