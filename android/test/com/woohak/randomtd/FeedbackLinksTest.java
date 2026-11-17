package com.woohak.randomtd;

/** FeedbackLinks 검사 (JUnit 없이 — 실패하면 종료 코드 1). android/check-java.sh가 부른다. */
public final class FeedbackLinksTest {
    private static int failures = 0;

    private static void is(boolean expected, String url, String what) {
        if (FeedbackLinks.isAllowed(url) != expected) {
            failures++;
            System.err.println("실패: " + what + " — 기대 " + expected + ": " + (url == null ? "null" : url.substring(0, Math.min(120, url.length()))));
        }
    }

    private static String repeat(char c, int n) {
        StringBuilder b = new StringBuilder(n);
        for (int i = 0; i < n; i++) b.append(c);
        return b.toString();
    }

    public static void main(String[] args) {
        String p = FeedbackLinks.PREFIX;
        String ok = p + "template=feedback.yml&title=%5B%ED%94%BC%EB%93%9C%EB%B0%B1%5D%20%EB%B2%84%EA%B7%B8&category=%EB%B2%84%EA%B7%B8"
                + "&body_text=a%26b%0Ac&game_info=app%3A%200.1.10&replay=%7B%22seed%22%3A7%7D";
        is(true, ok, "웹이 만든 주소");
        is(true, p + "template=feedback.yml", "짧은 주소");
        is(true, p + repeat('a', FeedbackLinks.MAX_LENGTH - p.length()), "8000자");
        is(false, p + repeat('a', FeedbackLinks.MAX_LENGTH - p.length() + 1), "8001자");
        is(false, null, "null");
        is(false, "", "빈 글자");
        is(false, p, "앞부분만");
        is(false, "http://github.com/qkqh6898-woohak/Random-TD/issues/new?template=feedback.yml", "http");
        is(false, "https://github.com/qkqh6898-woohak/Random-TD/issues/newx?template=feedback.yml", "다른 경로");
        is(false, "https://github.com/someone-else/Random-TD/issues/new?template=feedback.yml", "다른 저장소");
        is(false, "https://github.com.evil.example/qkqh6898-woohak/Random-TD/issues/new?a", "비슷한 호스트");
        is(false, "https://user@github.com/qkqh6898-woohak/Random-TD/issues/new?a", "사용자 정보");
        is(false, " " + ok, "앞 공백");
        is(false, "HTTPS://github.com/qkqh6898-woohak/Random-TD/issues/new?a", "대문자 (정확히 일치만)");
        is(false, ok + "\n", "줄바꿈");
        is(false, ok.replace("&category", "\r&category"), "CR");
        is(false, ok + "\u0000", "NUL");
        is(false, ok + "\u0007", "제어 문자");
        is(false, ok + "\u007f", "DEL");
        is(false, ok + "\u0085", "C1 제어 문자");
        is(false, ok + " ", "줄 구분자");
        is(false, ok + " x", "공백");
        is(false, ok + "한글", "인코딩 안 된 한글");
        is(false, "javascript:alert(1)//" + p, "javascript");
        if (failures > 0) {
            System.exit(1);
        }
        System.out.println("FeedbackLinksTest 통과");
    }
}
