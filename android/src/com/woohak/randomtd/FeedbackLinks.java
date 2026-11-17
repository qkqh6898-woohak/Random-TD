package com.woohak.randomtd;

/**
 * 게임 안 피드백 주소 확인 (FB-1, 안드로이드 API 없음 — JVM 검사 android/test/…/FeedbackLinksTest.java).
 * 웹(src/feedback/feedbackModel.ts)이 만든 GitHub 새 이슈 주소만 바깥 브라우저로 연다:
 *  - 정확히 {@link #PREFIX}로 시작 (저장소·경로·'?'까지 고정 → 다른 호스트·경로로 못 바꿈)
 *  - 길이 ≤ {@link #MAX_LENGTH}
 *  - 글자는 보이는 ASCII(0x21~0x7E)만 — 웹은 encodeURIComponent로 인코딩하므로 공백·줄바꿈·제어 문자·한글 원문이 있으면 거절
 */
public final class FeedbackLinks {
    public static final String PREFIX = "https://github.com/qkqh6898-woohak/Random-TD/issues/new?";
    public static final int MAX_LENGTH = 8000;

    private FeedbackLinks() {
    }

    /** 열어도 되는 피드백 주소인가 */
    public static boolean isAllowed(String url) {
        if (url == null) return false;
        if (url.length() > MAX_LENGTH || url.length() <= PREFIX.length()) return false;
        if (!url.startsWith(PREFIX)) return false;
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c < 0x21 || c > 0x7e) return false;
        }
        return true;
    }
}
