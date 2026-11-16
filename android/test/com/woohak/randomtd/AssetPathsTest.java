package com.woohak.randomtd;

/** AssetPaths 검사 (JUnit 없이: java -ea로 돌려 assert가 실패하면 종료 코드 1). android/check-java.sh가 부른다. */
public final class AssetPathsTest {
    private static int failures = 0;

    private static void eq(String expected, String actual, String what) {
        boolean same = expected == null ? actual == null : expected.equals(actual);
        if (!same) {
            failures++;
            System.err.println("실패: " + what + " — 기대 " + expected + ", 실제 " + actual);
        }
    }

    public static void main(String[] args) {
        String h = AssetPaths.GAME_HOST;
        eq("index.html", AssetPaths.assetPath("https", h, "/game/index.html"), "index");
        eq("index.html", AssetPaths.assetPath("https", h, "/game/"), "폴더 주소");
        eq("assets/index-C5dHPPp7.js", AssetPaths.assetPath("https", h, "/game/assets/index-C5dHPPp7.js"), "번들");
        eq("assets/characters/archer.webp", AssetPaths.assetPath("https", h, "/game/assets/characters/archer.webp"), "하위 폴더 그림");
        eq("assets/characters/manifest.json", AssetPaths.assetPath("https", h, "/game/assets/characters/manifest.json"), "매니페스트");
        eq(null, AssetPaths.assetPath("http", h, "/game/index.html"), "http");
        eq(null, AssetPaths.assetPath("https", "example.com", "/game/index.html"), "다른 호스트");
        eq(null, AssetPaths.assetPath("https", h, "/other/index.html"), "다른 경로");
        eq(null, AssetPaths.assetPath("https", h, "/game/assets/../AndroidManifest.xml"), "..");
        eq(null, AssetPaths.assetPath("https", h, "/game/assets/./a.js"), ".");
        eq(null, AssetPaths.assetPath("https", h, "/game/assets//a.js"), "빈 조각");
        eq(null, AssetPaths.assetPath("https", h, "/game/assets/"), "폴더만");
        eq(null, AssetPaths.assetPath("https", h, "/game/secret.txt"), "assets 밖");
        eq(null, AssetPaths.assetPath("https", h, "/game/assets/a b.js"), "공백");
        eq(null, AssetPaths.assetPath("https", h, null), "null 경로");
        eq("application/json", AssetPaths.mimeType("assets/characters/manifest.json"), "json");
        eq("image/webp", AssetPaths.mimeType("assets/title/title_1.webp"), "webp");
        eq("application/javascript", AssetPaths.mimeType("assets/index.js"), "js");
        eq(null, AssetPaths.mimeType("assets/a.bin"), "모름");
        if (failures > 0) {
            System.exit(1);
        }
        System.out.println("AssetPathsTest 통과");
    }
}
