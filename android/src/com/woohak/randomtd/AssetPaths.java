package com.woohak.randomtd;

/**
 * 게임 주소 → APK assets 경로 (안드로이드 API를 쓰지 않는 순수 함수라 android/test에서 JVM으로 검사한다).
 *
 * WebView는 https://appassets.androidplatform.net/game/ 아래만 게임 파일로 연다.
 * Vite 빌드(dist/)는 index.html + assets/ 아래 하위 폴더(characters/, backgrounds/, cutins/, title/ …)까지 쓰므로
 * 경로 조각마다 안전한 글자만 허용하고 '.'·'..'·빈 조각은 막는다.
 */
public final class AssetPaths {
    public static final String GAME_HOST = "appassets.androidplatform.net";
    public static final String GAME_PATH = "/game/";

    private AssetPaths() {}

    /** 게임 파일이면 assets 안 경로(예: "assets/characters/archer.webp"), 아니면 null. */
    public static String assetPath(String scheme, String host, String path) {
        if (!"https".equals(scheme) || !GAME_HOST.equals(host) || path == null || !path.startsWith(GAME_PATH)) return null;
        String rel = path.substring(GAME_PATH.length());
        if (rel.isEmpty() || rel.equals("index.html")) return "index.html";
        if (!rel.startsWith("assets/")) return null;
        String[] parts = rel.split("/", -1);
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || !part.matches("[A-Za-z0-9_.-]+")) return null;
        }
        return rel;
    }

    /** 파일 종류 (WebView 응답 Content-Type). 모르면 null → 부르는 쪽이 MimeTypeMap으로. */
    public static String mimeType(String path) {
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return null;
    }
}
