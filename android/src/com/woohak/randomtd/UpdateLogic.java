package com.woohak.randomtd;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 앱 안 업데이트(U-1)의 순수 규칙 — 안드로이드 API를 쓰지 않아 android/test에서 JVM으로 검사한다 (check-java.sh).
 *
 * - 릴리스: GitHub `releases/latest` JSON에서 태그 `android-v<x.y.z>`·APK 자산 `Random-TD_Offline_v<x.y.z>.apk`·SHA-256을 고른다.
 *   받는 주소는 이 JSON의 browser_download_url뿐이다 (웹 쪽 JS는 주소를 넘길 수 없다).
 * - 주소: HTTPS + 허용 호스트(GitHub API·다운로드·자산 저장소)만. 사용자 정보·다른 포트 거절.
 * - 무결성: 자산의 `digest`("sha256:<hex>") 또는 SHA256SUMS 줄과 받은 파일의 SHA-256이 같아야 설치한다.
 * - JS로 보내는 글: JSON 문자열 이스케이프 (U+2028·U+2029 포함 — evaluateJavascript에 그대로 넣어도 안전).
 */
public final class UpdateLogic {
    public static final String RELEASES_LATEST_URL = "https://api.github.com/repos/qkqh6898-woohak/Random-TD/releases/latest";
    public static final String TAG_PREFIX = "android-v";
    public static final String APK_PREFIX = "Random-TD_Offline_v";
    public static final String APK_SUFFIX = ".apk";
    public static final String SUMS_NAME = "SHA256SUMS";
    /** 받을 APK 최대 크기 (지금 약 15MB) */
    public static final long MAX_APK_BYTES = 64L * 1024 * 1024;
    /** 릴리스 JSON·SHA256SUMS 최대 크기 */
    public static final int MAX_JSON_BYTES = 1024 * 1024;
    public static final int MAX_SUMS_BYTES = 64 * 1024;
    /** 웹으로 넘기는 릴리스 노트 최대 글자 수 */
    public static final int MAX_NOTES_CHARS = 4000;

    private static final String[] ALLOWED_HOSTS = {
        "api.github.com",
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    };

    private UpdateLogic() {}

    // ------------------------------------------------------------------ 버전

    /** "x.y.z" → {x, y, z}, 틀리면 null (앞자리 0·접미사 거절, 각 자리 9자리까지). */
    public static int[] parseSemver(String text) {
        if (text == null) return null;
        String[] parts = text.split("\\.", -1);
        if (parts.length != 3) return null;
        int[] out = new int[3];
        for (int i = 0; i < 3; i++) {
            String p = parts[i];
            if (p.isEmpty() || p.length() > 9 || (p.length() > 1 && p.charAt(0) == '0')) return null;
            for (int j = 0; j < p.length(); j++) {
                char c = p.charAt(j);
                if (c < '0' || c > '9') return null;
            }
            out[i] = Integer.parseInt(p);
        }
        return out;
    }

    public static int compareSemver(int[] a, int[] b) {
        for (int i = 0; i < 3; i++) {
            if (a[i] != b[i]) return a[i] < b[i] ? -1 : 1;
        }
        return 0;
    }

    /** remote가 current보다 새 버전인가 (둘 중 하나라도 모양이 틀리면 false). */
    public static boolean isNewer(String remote, String current) {
        int[] r = parseSemver(remote);
        int[] c = parseSemver(current);
        return r != null && c != null && compareSemver(r, c) > 0;
    }

    /** "android-v0.1.10" → "0.1.10", 아니면 null */
    public static String versionFromTag(String tag) {
        if (tag == null || !tag.startsWith(TAG_PREFIX)) return null;
        String v = tag.substring(TAG_PREFIX.length());
        return parseSemver(v) == null ? null : v;
    }

    public static String apkName(String version) {
        return APK_PREFIX + version + APK_SUFFIX;
    }

    // ------------------------------------------------------------------ 주소

    /** HTTPS + 허용 호스트 + 기본 포트 + 사용자 정보 없음일 때만 true. */
    public static boolean isAllowedUrl(String url) {
        if (url == null || url.length() > 4096) return false;
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return false;
        }
        if (!"https".equals(uri.getScheme())) return false;
        if (uri.getRawUserInfo() != null) return false;
        int port = uri.getPort();
        if (port != -1 && port != 443) return false;
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        for (String allowed : ALLOWED_HOSTS) {
            if (allowed.equals(host)) return true;
        }
        return false;
    }

    /** 리다이렉트 Location을 지금 주소 기준으로 풀어 허용 주소면 돌려주고, 아니면 null. */
    public static String resolveRedirect(String base, String location) {
        if (location == null || location.isEmpty()) return null;
        try {
            String next = new URI(base).resolve(new URI(location)).toString();
            return isAllowedUrl(next) ? next : null;
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ 무결성

    /** "sha256:<64 hex>" → 소문자 hex, 아니면 null */
    public static String parseDigest(String digest) {
        if (digest == null || !digest.regionMatches(true, 0, "sha256:", 0, 7)) return null;
        return normalizeHex(digest.substring(7));
    }

    /** 64자 hex면 소문자로, 아니면 null */
    public static String normalizeHex(String hex) {
        if (hex == null || hex.length() != 64) return null;
        for (int i = 0; i < 64; i++) {
            char c = hex.charAt(i);
            boolean ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!ok) return null;
        }
        return hex.toLowerCase(Locale.ROOT);
    }

    /** sha256sum 출력("<hex>  <이름>" 또는 "<hex> *<이름>")에서 그 파일의 hex. 없으면 null */
    public static String findSha256(String sums, String fileName) {
        if (sums == null || fileName == null) return null;
        for (String raw : sums.split("\r?\n")) {
            String line = raw.trim();
            if (line.length() < 66) continue;
            String hex = normalizeHex(line.substring(0, 64));
            if (hex == null || line.charAt(64) != ' ') continue;
            String name = line.substring(65).trim();
            if (name.startsWith("*")) name = name.substring(1);
            if (name.equals(fileName)) return hex;
        }
        return null;
    }

    public static String toHex(byte[] bytes) {
        char[] digits = "0123456789abcdef".toCharArray();
        char[] out = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            out[i * 2] = digits[(bytes[i] >> 4) & 0xf];
            out[i * 2 + 1] = digits[bytes[i] & 0xf];
        }
        return new String(out);
    }

    /** 두 hex가 같은가 (대소문자 무시, 길이가 다르거나 null이면 false; 끝까지 비교) */
    public static boolean hexEquals(String a, String b) {
        String x = normalizeHex(a);
        String y = normalizeHex(b);
        if (x == null || y == null) return false;
        int diff = 0;
        for (int i = 0; i < 64; i++) diff |= x.charAt(i) ^ y.charAt(i);
        return diff == 0;
    }

    // ------------------------------------------------------------------ 릴리스 고르기

    /** 고른 릴리스 (받을 주소는 모두 isAllowedUrl을 통과했다) */
    public static final class Release {
        public final String version;
        public final String tag;
        public final String apkName;
        public final String apkUrl;
        public final long apkSize;
        /** 자산 digest의 SHA-256 (없으면 null → sumsUrl로) */
        public final String sha256;
        /** SHA256SUMS 자산 주소 (없으면 null) */
        public final String sumsUrl;
        public final String notes;

        Release(String version, String tag, String apkName, String apkUrl, long apkSize, String sha256, String sumsUrl, String notes) {
            this.version = version;
            this.tag = tag;
            this.apkName = apkName;
            this.apkUrl = apkUrl;
            this.apkSize = apkSize;
            this.sha256 = sha256;
            this.sumsUrl = sumsUrl;
            this.notes = notes;
        }
    }

    /** 릴리스를 쓸 수 없을 때 (이유는 기록용, 화면 글은 웹 쪽이 정한다) */
    public static final class BadRelease extends Exception {
        private static final long serialVersionUID = 1L;

        public BadRelease(String why) {
            super(why);
        }
    }

    /**
     * GitHub releases/latest JSON → Release. 초안·시험판·태그 모양·자산 이름·주소·크기·체크섬 출처를 모두 확인한다.
     * (새 버전인지는 부르는 쪽이 isNewer로)
     */
    public static Release pickRelease(String json) throws BadRelease {
        Object root;
        try {
            root = Json.parse(json);
        } catch (IllegalArgumentException e) {
            throw new BadRelease("JSON: " + e.getMessage());
        }
        if (!(root instanceof Map)) throw new BadRelease("JSON 객체가 아님");
        Map<?, ?> rel = (Map<?, ?>) root;
        if (Boolean.TRUE.equals(rel.get("draft")) || Boolean.TRUE.equals(rel.get("prerelease"))) throw new BadRelease("초안·시험판");
        Object tagObj = rel.get("tag_name");
        String tag = tagObj instanceof String ? (String) tagObj : null;
        String version = versionFromTag(tag);
        if (version == null) throw new BadRelease("태그 모양: " + tag);
        String wantApk = apkName(version);
        Object assetsObj = rel.get("assets");
        if (!(assetsObj instanceof List)) throw new BadRelease("자산 없음");
        Map<?, ?> apk = null;
        Map<?, ?> sums = null;
        for (Object a : (List<?>) assetsObj) {
            if (!(a instanceof Map)) continue;
            Object name = ((Map<?, ?>) a).get("name");
            if (wantApk.equals(name)) apk = (Map<?, ?>) a;
            else if (SUMS_NAME.equals(name)) sums = (Map<?, ?>) a;
        }
        if (apk == null) throw new BadRelease("APK 자산 없음: " + wantApk);
        String apkUrl = string(apk.get("browser_download_url"));
        if (!isAllowedUrl(apkUrl)) throw new BadRelease("APK 주소 거절");
        Object sizeObj = apk.get("size");
        long size = sizeObj instanceof Double ? (long) (double) (Double) sizeObj : -1;
        if (size <= 0 || size > MAX_APK_BYTES) throw new BadRelease("APK 크기: " + size);
        String sha = parseDigest(string(apk.get("digest")));
        String sumsUrl = sums == null ? null : string(sums.get("browser_download_url"));
        if (sumsUrl != null && !isAllowedUrl(sumsUrl)) sumsUrl = null;
        if (sha == null && sumsUrl == null) throw new BadRelease("체크섬 없음");
        String body = string(rel.get("body"));
        String notes = body == null ? "" : body;
        if (notes.length() > MAX_NOTES_CHARS) notes = notes.substring(0, MAX_NOTES_CHARS);
        return new Release(version, tag, wantApk, apkUrl, size, sha, sumsUrl, notes);
    }

    private static String string(Object o) {
        return o instanceof String ? (String) o : null;
    }

    // ------------------------------------------------------------------ JS로 보내는 글

    /** JSON 문자열 리터럴 (따옴표 포함). 제어 문자·U+2028·U+2029·'<'를 \\u로 — evaluateJavascript 안에서도 안전. */
    public static String jsonString(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder(s.length() + 2);
        b.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029 || c == '<' || c == '>' || c == 0x7f) {
                        b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
            }
        }
        b.append('"');
        return b.toString();
    }

    /**
     * 웹이 다시 확인(check)했을 때 지금 상태를 되살리는 사건들 (V2 검토 L6). 받는 중·설치 중에 WebView가 다시 읽히면(렌더러 재시작 등)
     * 웹은 'checking'에서 시작하고 제안(available)이 있어야 진행·설치 사건을 받는다 — 그래서 제안부터 지금 단계까지 순서대로 보낸다.
     * phase: "available" · "permission" · "downloading"(verifying = 크기·해시 확인 중) · "installing"(confirm = 시스템 확인 창이 떠 있음).
     * 그 밖의 상태는 빈 목록 (다시 확인하지 않는 상태는 부르는 쪽이 판단).
     */
    public static List<String> resyncEvents(String phase, String version, String current, String notes, long size, long received,
            boolean verifying, boolean confirm) {
        List<String> out = new ArrayList<>();
        boolean known = "available".equals(phase) || "permission".equals(phase) || "downloading".equals(phase) || "installing".equals(phase);
        if (!known) return out;
        out.add(jsonObject("type", "available", "version", version, "current", current, "notes", notes, "size", size));
        if ("permission".equals(phase)) {
            out.add(jsonObject("type", "permission"));
        } else if ("downloading".equals(phase)) {
            long got = Math.max(0L, Math.min(received, size));
            out.add(jsonObject("type", "progress", "received", got, "total", size));
            if (verifying) out.add(jsonObject("type", "verifying"));
        } else if ("installing".equals(phase)) {
            out.add(jsonObject("type", "progress", "received", size, "total", size));
            out.add(confirm ? jsonObject("type", "installing", "step", "confirm") : jsonObject("type", "installing"));
        }
        return out;
    }

    /** 키 순서를 지키는 작은 JSON 객체 만들기 (값: String·Long·Integer·Boolean·null) */
    public static String jsonObject(Object... keyValues) {
        if (keyValues.length % 2 != 0) throw new IllegalArgumentException("키·값 짝");
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < keyValues.length; i += 2) {
            if (i > 0) b.append(',');
            b.append(jsonString(String.valueOf(keyValues[i]))).append(':');
            Object v = keyValues[i + 1];
            if (v == null) b.append("null");
            else if (v instanceof String) b.append(jsonString((String) v));
            else if (v instanceof Long || v instanceof Integer || v instanceof Boolean) b.append(v);
            else throw new IllegalArgumentException("값 종류: " + v.getClass());
        }
        return b.append('}').toString();
    }

    // ------------------------------------------------------------------ 작은 JSON 파서

    /** 아주 작은 JSON 파서 (객체 → LinkedHashMap, 배열 → ArrayList, 숫자 → Double). 깊이 64까지. */
    static final class Json {
        private final String s;
        private int i;
        private int depth;

        private Json(String s) {
            this.s = s;
        }

        static Object parse(String text) {
            if (text == null) throw new IllegalArgumentException("null");
            Json p = new Json(text);
            p.ws();
            Object v = p.value();
            p.ws();
            if (p.i != p.s.length()) throw new IllegalArgumentException("끝에 남은 글자 @" + p.i);
            return v;
        }

        private void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++;
                else break;
            }
        }

        private Object value() {
            if (i >= s.length()) throw new IllegalArgumentException("값 없음");
            char c = s.charAt(i);
            if (c == '{') return object();
            if (c == '[') return array();
            if (c == '"') return str();
            if (c == 't' && s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (c == 'f' && s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (c == 'n' && s.startsWith("null", i)) { i += 4; return null; }
            if (c == '-' || (c >= '0' && c <= '9')) return number();
            throw new IllegalArgumentException("모르는 글자 @" + i);
        }

        private Map<String, Object> object() {
            if (++depth > 64) throw new IllegalArgumentException("너무 깊음");
            Map<String, Object> m = new LinkedHashMap<>();
            i++;
            ws();
            if (peek() == '}') { i++; depth--; return m; }
            while (true) {
                ws();
                if (peek() != '"') throw new IllegalArgumentException("키 @" + i);
                String k = str();
                ws();
                if (peek() != ':') throw new IllegalArgumentException(": @" + i);
                i++;
                ws();
                m.put(k, value());
                ws();
                char c = peek();
                i++;
                if (c == ',') continue;
                if (c == '}') break;
                throw new IllegalArgumentException(", 또는 } @" + i);
            }
            depth--;
            return m;
        }

        private List<Object> array() {
            if (++depth > 64) throw new IllegalArgumentException("너무 깊음");
            List<Object> a = new ArrayList<>();
            i++;
            ws();
            if (peek() == ']') { i++; depth--; return a; }
            while (true) {
                ws();
                a.add(value());
                ws();
                char c = peek();
                i++;
                if (c == ',') continue;
                if (c == ']') break;
                throw new IllegalArgumentException(", 또는 ] @" + i);
            }
            depth--;
            return a;
        }

        private char peek() {
            if (i >= s.length()) throw new IllegalArgumentException("갑자기 끝남");
            return s.charAt(i);
        }

        private String str() {
            i++;
            StringBuilder b = new StringBuilder();
            while (true) {
                char c = peek();
                i++;
                if (c == '"') return b.toString();
                if (c == '\\') {
                    char e = peek();
                    i++;
                    switch (e) {
                        case '"': b.append('"'); break;
                        case '\\': b.append('\\'); break;
                        case '/': b.append('/'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'n': b.append('\n'); break;
                        case 'r': b.append('\r'); break;
                        case 't': b.append('\t'); break;
                        case 'u':
                            if (i + 4 > s.length()) throw new IllegalArgumentException("\\u @" + i);
                            try {
                                b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                            } catch (NumberFormatException ex) {
                                throw new IllegalArgumentException("\\u @" + i);
                            }
                            i += 4;
                            break;
                        default:
                            throw new IllegalArgumentException("이스케이프 @" + i);
                    }
                } else if (c < 0x20) {
                    throw new IllegalArgumentException("제어 문자 @" + i);
                } else {
                    b.append(c);
                }
            }
        }

        private Double number() {
            int start = i;
            if (peek() == '-') i++;
            while (i < s.length()) {
                char c = s.charAt(i);
                if ((c >= '0' && c <= '9') || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') i++;
                else break;
            }
            try {
                return Double.valueOf(s.substring(start, i));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("숫자 @" + start);
            }
        }
    }
}
