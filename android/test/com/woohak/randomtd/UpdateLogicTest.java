package com.woohak.randomtd;

/** UpdateLogic 검사 (JUnit 없이: 실패하면 종료 코드 1). android/check-java.sh가 부른다. */
public final class UpdateLogicTest {
    private static int failures = 0;

    private static void ok(boolean cond, String what) {
        if (!cond) {
            failures++;
            System.err.println("실패: " + what);
        }
    }

    private static void eq(Object expected, Object actual, String what) {
        boolean same = expected == null ? actual == null : expected.equals(actual);
        if (!same) {
            failures++;
            System.err.println("실패: " + what + " — 기대 " + expected + ", 실제 " + actual);
        }
    }

    private static final String HEX = "b348c84d8193182f6939f36dae412b11008f2b2a3f02c33e19caebb61c23cae4";
    private static final String SUMS_HEX = "9b5d82225e773527331c888d8320420bee815104faf5e162a27d37912427361f";

    /** 실제 GitHub releases/latest 응답 모양 (android-v0.1.9에서 줄임, 버전만 바꿈) */
    private static String release(String tag, String apkName, String apkUrl, String digest, boolean withSums, String extra) {
        return "{\"url\":\"https://api.github.com/repos/qkqh6898-woohak/Random-TD/releases/447613450\","
                + "\"author\":{\"login\":\"github-actions[bot]\",\"id\":41898282,\"site_admin\":false},"
                + "\"tag_name\":" + UpdateLogic.jsonString(tag) + ","
                + "\"target_commitish\":\"7d50ff757f9efa636d0254889e89373d527acdce\","
                + "\"name\":\"\\uc6b4\\ube68 \\ub514\\ud39c\\uc2a4 Android\",\"draft\":false,\"immutable\":false,\"prerelease\":false,"
                + "\"created_at\":\"2026-11-16T20:29:47Z\",\"published_at\":\"2026-11-16T21:04:43Z\"," + extra
                + "\"assets\":["
                + "{\"url\":\"https://api.github.com/repos/x/y/releases/assets/1\",\"id\":756443985,\"name\":" + UpdateLogic.jsonString(apkName) + ","
                + "\"label\":\"\",\"content_type\":\"application/vnd.android.package-archive\",\"state\":\"uploaded\",\"size\":14717353,"
                + "\"digest\":" + (digest == null ? "null" : UpdateLogic.jsonString(digest)) + ",\"download_count\":3,"
                + "\"browser_download_url\":" + UpdateLogic.jsonString(apkUrl) + "}"
                + (withSums ? ",{\"id\":2,\"name\":\"SHA256SUMS\",\"size\":95,\"digest\":\"sha256:" + SUMS_HEX + "\","
                        + "\"browser_download_url\":\"https://github.com/qkqh6898-woohak/Random-TD/releases/download/" + tag + "/SHA256SUMS\"}" : "")
                + "],\"tarball_url\":null,"
                + "\"body\":\"Assets\\uc758 APK\\ub97c \\ub0b4\\ub824\\ubc1b\\uc544\\uc694.\\n\\n### \\ubc14\\ub010 \\uc810\\n- U-1 \\uc790\\ub3d9 \\ub9b4\\ub9ac\\uc2a4\"}";
    }

    private static String good(String version) {
        String tag = "android-v" + version;
        return release(tag, "Random-TD_Offline_v" + version + ".apk",
                "https://github.com/qkqh6898-woohak/Random-TD/releases/download/" + tag + "/Random-TD_Offline_v" + version + ".apk",
                "sha256:" + HEX, true, "");
    }

    private static void bad(String json, String what) {
        try {
            UpdateLogic.pickRelease(json);
            failures++;
            System.err.println("실패: 거절해야 함 — " + what);
        } catch (UpdateLogic.BadRelease expected) {
            // 거절
        }
    }

    public static void main(String[] args) throws Exception {
        // 버전
        ok(UpdateLogic.isNewer("0.1.10", "0.1.9"), "0.1.10 > 0.1.9 (숫자 비교)");
        ok(UpdateLogic.isNewer("0.2.0", "0.1.99"), "0.2.0 > 0.1.99");
        ok(UpdateLogic.isNewer("1.0.0", "0.999.999"), "1.0.0 > 0.999.999");
        ok(!UpdateLogic.isNewer("0.1.9", "0.1.9"), "같으면 아님");
        ok(!UpdateLogic.isNewer("0.1.8", "0.1.9"), "낮으면 아님");
        ok(!UpdateLogic.isNewer("0.1.10", "0.1.9-dev"), "현재 버전 모양이 틀리면 아님");
        ok(!UpdateLogic.isNewer("0.1", "0.0.1"), "원격 모양이 틀리면 아님");
        eq(null, UpdateLogic.parseSemver("01.2.3"), "앞자리 0");
        eq(null, UpdateLogic.parseSemver("1.2.3.4"), "네 자리");
        eq(null, UpdateLogic.parseSemver("1.2.x"), "글자");
        eq(null, UpdateLogic.parseSemver("1.2.9999999999"), "너무 큼");
        eq("0.1.10", UpdateLogic.versionFromTag("android-v0.1.10"), "태그");
        eq(null, UpdateLogic.versionFromTag("v0.1.10"), "다른 태그");
        eq(null, UpdateLogic.versionFromTag("android-v0.1.10-rc1"), "시험 태그");
        eq(null, UpdateLogic.versionFromTag(null), "null 태그");

        // 주소
        ok(UpdateLogic.isAllowedUrl("https://api.github.com/repos/a/b/releases/latest"), "API");
        ok(UpdateLogic.isAllowedUrl("https://github.com/a/b/releases/download/t/x.apk"), "github.com");
        ok(UpdateLogic.isAllowedUrl("https://objects.githubusercontent.com/x?sig=1"), "objects");
        ok(UpdateLogic.isAllowedUrl("https://release-assets.githubusercontent.com/github-production-release-asset/1?sp=r&sig=a%2Fb"), "release-assets");
        ok(UpdateLogic.isAllowedUrl("https://GitHub.com/a"), "호스트 대소문자");
        ok(UpdateLogic.isAllowedUrl("https://github.com:443/a"), "443 포트");
        ok(!UpdateLogic.isAllowedUrl("http://github.com/a"), "http 거절");
        ok(!UpdateLogic.isAllowedUrl("https://evil.com/a"), "다른 호스트");
        ok(!UpdateLogic.isAllowedUrl("https://github.com.evil.com/a"), "접미 호스트");
        ok(!UpdateLogic.isAllowedUrl("https://evilgithub.com/a"), "비슷한 호스트");
        ok(!UpdateLogic.isAllowedUrl("https://user:pw@github.com/a"), "사용자 정보");
        ok(!UpdateLogic.isAllowedUrl("https://github.com@evil.com/a"), "@ 속임");
        ok(!UpdateLogic.isAllowedUrl("https://github.com:8443/a"), "다른 포트");
        ok(!UpdateLogic.isAllowedUrl("file:///sdcard/x.apk"), "file");
        ok(!UpdateLogic.isAllowedUrl("javascript:alert(1)"), "javascript");
        ok(!UpdateLogic.isAllowedUrl(""), "빈 주소");
        ok(!UpdateLogic.isAllowedUrl(null), "null 주소");
        ok(!UpdateLogic.isAllowedUrl("https://"), "호스트 없음");
        eq("https://release-assets.githubusercontent.com/a/b?x=1",
                UpdateLogic.resolveRedirect("https://github.com/o/r/releases/download/t/x.apk", "https://release-assets.githubusercontent.com/a/b?x=1"),
                "리다이렉트 허용");
        eq("https://github.com/o/r/other", UpdateLogic.resolveRedirect("https://github.com/o/r/releases", "/o/r/other"), "상대 리다이렉트");
        eq(null, UpdateLogic.resolveRedirect("https://github.com/o", "https://evil.com/x.apk"), "리다이렉트 다른 호스트 거절");
        eq(null, UpdateLogic.resolveRedirect("https://github.com/o", "http://github.com/x.apk"), "리다이렉트 http 거절");
        eq(null, UpdateLogic.resolveRedirect("https://github.com/o", null), "Location 없음");

        // 무결성
        eq(HEX, UpdateLogic.parseDigest("sha256:" + HEX), "digest");
        eq(HEX, UpdateLogic.parseDigest("SHA256:" + HEX.toUpperCase()), "digest 대문자");
        eq(null, UpdateLogic.parseDigest("sha512:" + HEX), "다른 알고리즘");
        eq(null, UpdateLogic.parseDigest("sha256:" + HEX.substring(1)), "짧은 hex");
        eq(null, UpdateLogic.parseDigest("sha256:" + HEX.substring(1) + "g"), "hex 아님");
        eq(null, UpdateLogic.parseDigest(null), "digest 없음");
        String sums = SUMS_HEX + "  Other.apk\n" + HEX + "  Random-TD_Offline_v0.1.10.apk\n";
        eq(HEX, UpdateLogic.findSha256(sums, "Random-TD_Offline_v0.1.10.apk"), "SHA256SUMS 줄");
        eq(HEX, UpdateLogic.findSha256(HEX + " *Random-TD_Offline_v0.1.10.apk\r\n", "Random-TD_Offline_v0.1.10.apk"), "SHA256SUMS 바이너리 표시");
        eq(null, UpdateLogic.findSha256(sums, "Random-TD_Offline_v0.1.1.apk"), "SHA256SUMS 다른 파일");
        eq(null, UpdateLogic.findSha256(sums, "Random-TD_Offline_v0.1.10.ap"), "SHA256SUMS 이름 일부");
        ok(UpdateLogic.hexEquals(HEX, HEX.toUpperCase()), "hex 같음");
        ok(!UpdateLogic.hexEquals(HEX, SUMS_HEX), "hex 다름");
        ok(!UpdateLogic.hexEquals(HEX, null), "hex null");
        eq("00ff10", UpdateLogic.toHex(new byte[] {0, (byte) 0xff, 0x10}), "toHex");
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        eq("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", UpdateLogic.toHex(md.digest("abc".getBytes("UTF-8"))), "SHA-256 abc");

        // 릴리스 고르기
        UpdateLogic.Release r = UpdateLogic.pickRelease(good("0.1.10"));
        eq("0.1.10", r.version, "버전");
        eq("android-v0.1.10", r.tag, "태그 그대로");
        eq("Random-TD_Offline_v0.1.10.apk", r.apkName, "APK 이름");
        eq("https://github.com/qkqh6898-woohak/Random-TD/releases/download/android-v0.1.10/Random-TD_Offline_v0.1.10.apk", r.apkUrl, "APK 주소");
        eq(14717353L, r.apkSize, "크기");
        eq(HEX, r.sha256, "digest");
        eq("https://github.com/qkqh6898-woohak/Random-TD/releases/download/android-v0.1.10/SHA256SUMS", r.sumsUrl, "SUMS 주소");
        ok(r.notes.contains("### 바뀐 점") && r.notes.contains("- U-1 자동 릴리스"), "노트 (\\u 풀기): " + r.notes);
        // digest가 없으면 SHA256SUMS로
        UpdateLogic.Release noDigest = UpdateLogic.pickRelease(release("android-v0.1.10", "Random-TD_Offline_v0.1.10.apk",
                "https://github.com/o/r/releases/download/android-v0.1.10/Random-TD_Offline_v0.1.10.apk", null, true, ""));
        eq(null, noDigest.sha256, "digest 없음");
        ok(noDigest.sumsUrl != null, "SUMS로 확인");
        bad(release("android-v0.1.10", "Random-TD_Offline_v0.1.10.apk",
                "https://github.com/o/r/releases/download/android-v0.1.10/Random-TD_Offline_v0.1.10.apk", null, false, ""), "체크섬이 하나도 없음");
        bad(release("android-v0.1.10", "Random-TD_Offline_v0.1.9.apk",
                "https://github.com/o/r/x.apk", "sha256:" + HEX, true, ""), "APK 이름이 태그 버전과 다름");
        bad(release("v0.1.10", "Random-TD_Offline_v0.1.10.apk",
                "https://github.com/o/r/x.apk", "sha256:" + HEX, true, ""), "태그 모양");
        bad(release("android-v0.1.10", "Random-TD_Offline_v0.1.10.apk",
                "https://evil.com/Random-TD_Offline_v0.1.10.apk", "sha256:" + HEX, true, ""), "APK 주소 다른 호스트");
        bad(release("android-v0.1.10", "Random-TD_Offline_v0.1.10.apk",
                "http://github.com/x.apk", "sha256:" + HEX, true, ""), "APK 주소 http");
        bad(good("0.1.10").replace("\"draft\":false", "\"draft\":true"), "초안");
        bad(good("0.1.10").replace("\"prerelease\":false", "\"prerelease\":true"), "시험판");
        bad(good("0.1.10").replace("\"size\":14717353", "\"size\":99999999999"), "너무 큼");
        bad(good("0.1.10").replace("\"size\":14717353", "\"size\":0"), "크기 0");
        bad("{\"message\":\"API rate limit exceeded\"}", "오류 응답");
        bad("[1,2]", "배열");
        bad("{\"tag_name\":\"android-v0.1.10\"", "잘린 JSON");
        bad("", "빈 응답");
        bad("{\"a\":1} x", "끝에 남은 글자");
        StringBuilder deep = new StringBuilder();
        for (int i = 0; i < 100; i++) deep.append('[');
        bad(deep.toString(), "너무 깊음");

        // JS로 보내는 글
        eq("\"a\\\"b\\\\c\\n\\u2028\\u003c/script\\u003e\"", UpdateLogic.jsonString("a\"b\\c\n </script>"), "jsonString");
        eq("{\"type\":\"progress\",\"received\":5,\"total\":10,\"ok\":true,\"x\":null}",
                UpdateLogic.jsonObject("type", "progress", "received", 5L, "total", 10, "ok", true, "x", null), "jsonObject");
        // 우리가 만든 JSON을 우리 파서가 다시 읽는다 (왕복)
        Object back = UpdateLogic.Json.parse(UpdateLogic.jsonObject("notes", "줄1\n\"따옴표\" <b>"));
        eq("줄1\n\"따옴표\" <b>", ((java.util.Map<?, ?>) back).get("notes"), "왕복");

        // V2 L6: 받는 중·설치 중에 웹이 다시 확인(페이지 다시 읽기)하면 지금 상태를 처음부터 다시 보낸다
        String avail = "{\"type\":\"available\",\"version\":\"0.2.0\",\"current\":\"0.1.9\",\"notes\":\"n\",\"size\":100}";
        eq(java.util.Arrays.asList(avail), UpdateLogic.resyncEvents("available", "0.2.0", "0.1.9", "n", 100L, 0L, false, false), "다시 확인: 제안만");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"permission\"}"),
                UpdateLogic.resyncEvents("permission", "0.2.0", "0.1.9", "n", 100L, 0L, false, false), "다시 확인: 권한 대기");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"progress\",\"received\":40,\"total\":100}"),
                UpdateLogic.resyncEvents("downloading", "0.2.0", "0.1.9", "n", 100L, 40L, false, false), "다시 확인: 받는 중 진행률");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"progress\",\"received\":100,\"total\":100}", "{\"type\":\"verifying\"}"),
                UpdateLogic.resyncEvents("downloading", "0.2.0", "0.1.9", "n", 100L, 100L, true, false), "다시 확인: 확인 중");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"progress\",\"received\":100,\"total\":100}", "{\"type\":\"installing\"}"),
                UpdateLogic.resyncEvents("installing", "0.2.0", "0.1.9", "n", 100L, 100L, false, false), "다시 확인: 설치 세션");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"progress\",\"received\":100,\"total\":100}", "{\"type\":\"installing\",\"step\":\"confirm\"}"),
                UpdateLogic.resyncEvents("installing", "0.2.0", "0.1.9", "n", 100L, 100L, false, true), "다시 확인: 설치 확인 창");
        eq(java.util.Arrays.asList(avail, "{\"type\":\"progress\",\"received\":100,\"total\":100}"),
                UpdateLogic.resyncEvents("downloading", "0.2.0", "0.1.9", "n", 100L, 500L, false, false), "받은 양은 전체를 넘지 않음");
        eq(java.util.Collections.emptyList(), UpdateLogic.resyncEvents("idle", "0.2.0", "0.1.9", "n", 100L, 0L, false, false), "모르는 상태는 없음");

        if (failures > 0) {
            System.err.println("UpdateLogicTest 실패 " + failures + "개");
            System.exit(1);
        }
        System.out.println("UpdateLogicTest 통과");
    }
}
