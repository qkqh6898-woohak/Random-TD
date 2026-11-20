package com.woohak.randomtd;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

/**
 * 앱 안 업데이트 (U-1). 네트워크는 모두 여기(자바, 백그라운드 스레드)에서만 — WebView는 여전히 APK 안 파일만 연다.
 *
 * 흐름: check → GitHub releases/latest(공개, 인증 없음) → 새 버전이면 'available' → (웹에서 [지금 업데이트]) start
 *   → '출처를 알 수 없는 앱 설치' 허용 확인(없으면 'permission' → 설정 열기 → 돌아오면 onResume에서 이어 감)
 *   → APK 받기('progress') → 크기·SHA-256·패키지 이름·버전 확인('verifying') → PackageInstaller 세션('installing')
 *   → 시스템 설치 확인 창 (같은 앱 ID·같은 서명 → 업데이트, localStorage 그대로).
 * 웹이 고를 수 있는 것은 '확인/시작/설정 열기/취소'뿐이고, 받을 주소는 릴리스 JSON에서 자바가 정한다 (허용 호스트만, 리다이렉트도 한 번씩 확인).
 * 결과는 window.__rtdUpdate(JSON)으로 보낸다 (Sink, UI 스레드). 화면 글(한국어)은 웹 쪽(src/update)이 정한다.
 * 이 클래스의 상태는 UI 스레드에서만 바꾼다 (백그라운드 작업은 결과를 main으로 post).
 * 람다를 쓰지 않는다: build-apk.sh의 ecj가 android.jar로 컴파일할 때 LambdaMetafactory를 찾지 못한다 (익명 Runnable).
 */
final class Updater {
    interface Sink {
        void send(String json);
    }

    private static final String TAG = "RandomTDUpdate";
    private static final String USER_AGENT = "RandomTD-Android";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_REDIRECTS = 5;
    private static final long PROGRESS_INTERVAL_MS = 150;

    private enum State { IDLE, CHECKING, NO_UPDATE, AVAILABLE, PERMISSION, DOWNLOADING, INSTALLING, FAILED }

    /** 설치 결과(InstallReceiver)를 받을 지금 화면의 Updater (UI 스레드에서만 읽고 씀) */
    private static Updater active;

    private final Activity activity;
    private final Sink sink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private State state = State.IDLE;
    private UpdateLogic.Release release;
    private String expectedSha256;
    private boolean awaitingPermission;
    private volatile boolean cancelled;
    /** 다시 확인(check)할 때 되살릴 진행 상태 (V2 L6, UI 스레드에서만): 받은 바이트 · 확인 중 · 시스템 설치 확인 창이 떠 있음 */
    private long received;
    private boolean verifying;
    private boolean installConfirm;

    Updater(Activity activity, Sink sink) {
        this.activity = activity;
        this.sink = sink;
        active = this;
    }

    // ------------------------------------------------------------------ 웹에서 (UI 스레드)

    void check() {
        // 받는 중·설치 중·권한 대기 중에 웹이 다시 읽혔으면(렌더러 재시작 등) 제안부터 지금 단계까지 다시 보낸다 (V2 L6 —
        // 예전엔 조용히 돌아가 웹이 'checking'에 멈춘 채 진행 사건을 모두 버리고, 나중에 시스템 설치 창만 갑자기 떴다)
        if (release != null && (state == State.AVAILABLE || state == State.PERMISSION || state == State.DOWNLOADING || state == State.INSTALLING)) {
            resync();
            return;
        }
        if (state != State.IDLE && state != State.NO_UPDATE && state != State.FAILED) return;
        state = State.CHECKING;
        final String current = installedVersionName();
        io.execute(new Runnable() { @Override public void run() {
            try {
                UpdateLogic.Release r = UpdateLogic.pickRelease(fetchText(UpdateLogic.RELEASES_LATEST_URL,
                        UpdateLogic.MAX_JSON_BYTES, "application/vnd.github+json"));
                if (current == null || !UpdateLogic.isNewer(r.version, current)) {
                    post(new Runnable() { @Override public void run() {
                        state = State.NO_UPDATE;
                        sink.send(UpdateLogic.jsonObject("type", "none", "current", current));
                    }});
                    return;
                }
                String sha = r.sha256;
                if (sha == null) {
                    sha = UpdateLogic.findSha256(fetchText(r.sumsUrl, UpdateLogic.MAX_SUMS_BYTES, "application/octet-stream"), r.apkName);
                    if (sha == null) throw new UpdateLogic.BadRelease("SHA256SUMS에 APK 줄이 없음");
                }
                final String expected = sha;
                post(new Runnable() { @Override public void run() {
                    release = r;
                    expectedSha256 = expected;
                    state = State.AVAILABLE;
                    sendAvailable();
                }});
            } catch (UpdateLogic.BadRelease e) {
                fail("release", e);
            } catch (IOException | RuntimeException e) {
                fail("network", e);
            }
        }});
    }

    void start() {
        if (release == null || expectedSha256 == null) return;
        if (state != State.AVAILABLE && state != State.PERMISSION && state != State.FAILED) return;
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            state = State.PERMISSION;
            sink.send(UpdateLogic.jsonObject("type", "permission"));
            return;
        }
        download();
    }

    /** '출처를 알 수 없는 앱 설치' 설정 (이 앱만). 돌아오면 onResume에서 이어 간다. */
    void openInstallSettings() {
        if (state != State.PERMISSION) return;
        try {
            awaitingPermission = true;
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
        } catch (ActivityNotFoundException e) {
            awaitingPermission = false;
            fail("permission", e);
        }
    }

    void cancel() {
        if (state == State.DOWNLOADING) cancelled = true;
        else if (state == State.PERMISSION) {
            awaitingPermission = false;
            state = State.AVAILABLE;
        }
    }

    // ------------------------------------------------------------------ 화면 생명주기 (UI 스레드)

    void onResume() {
        if (!awaitingPermission) return;
        awaitingPermission = false;
        if (state != State.PERMISSION) return;
        if (activity.getPackageManager().canRequestPackageInstalls()) download();
        else {
            state = State.AVAILABLE;
            sink.send(UpdateLogic.jsonObject("type", "error", "code", "permission"));
        }
    }

    void destroy() {
        cancelled = true;
        io.shutdownNow();
        if (active == this) active = null;
    }

    // ------------------------------------------------------------------ 받기·확인·설치

    private void download() {
        state = State.DOWNLOADING;
        cancelled = false;
        received = 0;
        verifying = false;
        installConfirm = false;
        final UpdateLogic.Release r = release;
        final String expected = expectedSha256;
        final File dir = new File(activity.getCacheDir(), "updates");
        final String pkg = activity.getPackageName();
        final long installedCode = installedVersionCode();
        sink.send(UpdateLogic.jsonObject("type", "progress", "received", 0L, "total", r.apkSize));
        io.execute(new Runnable() { @Override public void run() {
            File apk = null;
            boolean installing = false;
            try {
                clearDir(dir);
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("캐시 폴더");
                apk = new File(dir, "update.apk");
                String actual = fetchToFile(r, apk);
                post(new Runnable() { @Override public void run() {
                    verifying = true;
                    sink.send(UpdateLogic.jsonObject("type", "verifying"));
                }});
                if (apk.length() != r.apkSize) throw new VerifyFailed("크기 " + apk.length() + " ≠ " + r.apkSize);
                if (!UpdateLogic.hexEquals(actual, expected)) throw new VerifyFailed("SHA-256 다름");
                checkArchive(apk, pkg, r.version, installedCode);
                // 확인하는 동안 [취소]를 눌렀으면 설치 창을 띄우지 않는다
                if (cancelled) throw new Cancelled();
                installing = true;
                post(new Runnable() { @Override public void run() {
                    state = State.INSTALLING;
                    verifying = false;
                    sink.send(UpdateLogic.jsonObject("type", "installing"));
                }});
                install(apk, pkg);
            } catch (Cancelled e) {
                deleteQuietly(apk);
                post(new Runnable() { @Override public void run() {
                    state = State.AVAILABLE;
                    sink.send(UpdateLogic.jsonObject("type", "cancelled"));
                }});
            } catch (VerifyFailed e) {
                deleteQuietly(apk);
                fail("digest", e);
            } catch (IOException | RuntimeException e) {
                deleteQuietly(apk);
                fail(installing ? "install" : "network", e);
            } finally {
                // 세션에 다 썼으면 받은 파일은 필요 없다 (확인 실패·취소도 지움)
                deleteQuietly(apk);
            }
        }});
    }

    /** 받아서 파일에 쓰고 SHA-256(hex)을 돌려준다. 크기 상한·취소를 확인한다. */
    private String fetchToFile(UpdateLogic.Release r, File apk) throws IOException, Cancelled {
        MessageDigest md;
        try {
            md = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
        HttpURLConnection c = open(r.apkUrl, "application/octet-stream");
        try {
            long declared = c.getContentLengthLong();
            if (declared > UpdateLogic.MAX_APK_BYTES || (declared > 0 && declared != r.apkSize)) {
                throw new IOException("Content-Length " + declared);
            }
            long count = 0;
            long lastSent = 0;
            byte[] buf = new byte[64 * 1024];
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (cancelled) throw new Cancelled();
                    count += n;
                    if (count > UpdateLogic.MAX_APK_BYTES || count > r.apkSize) throw new IOException("너무 큼");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                    long now = SystemClock.uptimeMillis();
                    if (now - lastSent >= PROGRESS_INTERVAL_MS) {
                        lastSent = now;
                        final long got = count;
                        post(new Runnable() { @Override public void run() {
                            received = got;
                            sink.send(UpdateLogic.jsonObject("type", "progress", "received", got, "total", r.apkSize));
                        }});
                    }
                }
                out.flush();
            }
            if (cancelled) throw new Cancelled();
            final long done = count;
            post(new Runnable() { @Override public void run() {
                received = done;
                sink.send(UpdateLogic.jsonObject("type", "progress", "received", done, "total", r.apkSize));
            }});
            return UpdateLogic.toHex(md.digest());
        } finally {
            c.disconnect();
        }
    }

    /** 받은 APK가 이 앱(같은 앱 ID)의 그 버전이고 versionCode가 더 큰가. 서명은 설치할 때 OS가 확인한다. */
    private void checkArchive(File apk, String pkg, String version, long installedCode) throws VerifyFailed {
        PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
        if (info == null) throw new VerifyFailed("APK를 읽지 못함");
        if (!pkg.equals(info.packageName)) throw new VerifyFailed("앱 ID " + info.packageName);
        if (!version.equals(info.versionName)) throw new VerifyFailed("versionName " + info.versionName);
        if (installedCode >= 0 && info.getLongVersionCode() <= installedCode) throw new VerifyFailed("versionCode " + info.getLongVersionCode());
    }

    private void install(File apk, String pkg) throws IOException {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(pkg);
        params.setSize(apk.length());
        int id = installer.createSession(params);
        boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                session.fsync(out);
            }
            Intent status = new Intent(activity, InstallReceiver.class)
                    .setAction(InstallReceiver.ACTION)
                    .setPackage(pkg);
            // 설치기가 결과(EXTRA_STATUS·확인 Intent)를 채워 넣으므로 MUTABLE (API 31+는 명시 필수). 명시적 Intent라 API 34+에서도 허용.
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pending = PendingIntent.getBroadcast(activity, id, status, flags);
            session.commit(pending.getIntentSender());
            committed = true;
        } finally {
            if (!committed) {
                try {
                    installer.abandonSession(id);
                } catch (RuntimeException ignored) {
                    // 이미 없어진 세션
                }
            }
        }
    }

    // ------------------------------------------------------------------ 설치 결과 (InstallReceiver → UI 스레드)

    static void onInstallStatus(Context context, int status, Intent confirm, String message) {
        Updater u = active;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            boolean shown = false;
            if (confirm != null && isSystemConfirm(context, confirm)) {
                try {
                    if (u != null && !u.activity.isFinishing()) u.activity.startActivity(confirm);
                    else context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    shown = true;
                } catch (RuntimeException e) {
                    Log.w(TAG, "설치 확인 창을 열지 못함", e);
                }
            }
            if (u == null) return;
            if (shown) {
                u.installConfirm = true;
                u.sink.send(UpdateLogic.jsonObject("type", "installing", "step", "confirm"));
            }
            else u.failNow("install", "확인 창 없음");
            return;
        }
        if (u == null) return;
        if (status == PackageInstaller.STATUS_SUCCESS) {
            u.state = State.IDLE;
            u.sink.send(UpdateLogic.jsonObject("type", "installed"));
        } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
            u.state = State.AVAILABLE;
            u.sink.send(UpdateLogic.jsonObject("type", "error", "code", "aborted"));
        } else {
            u.failNow("install", "status " + status + ": " + message);
        }
    }

    /** 확인 Intent가 이 앱 자신(내보내지 않은 화면 등)으로 가지 않는지 — 시스템 설치기 화면만 연다 */
    private static boolean isSystemConfirm(Context context, Intent confirm) {
        ComponentName target = confirm.resolveActivity(context.getPackageManager());
        return target != null && !context.getPackageName().equals(target.getPackageName());
    }

    // ------------------------------------------------------------------ 네트워크

    /** 허용 호스트의 HTTPS만, 리다이렉트는 직접 따라가며 한 번씩 확인한다. 200이 아니면 IOException. */
    private static HttpURLConnection open(String url, String accept) throws IOException {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!UpdateLogic.isAllowedUrl(current)) throw new IOException("허용하지 않는 주소");
            HttpsURLConnection c = (HttpsURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(CONNECT_TIMEOUT_MS);
            c.setReadTimeout(READ_TIMEOUT_MS);
            c.setUseCaches(false);
            c.setRequestProperty("User-Agent", USER_AGENT);
            c.setRequestProperty("Accept", accept);
            int code = c.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String next = UpdateLogic.resolveRedirect(current, c.getHeaderField("Location"));
                c.disconnect();
                if (next == null) throw new IOException("허용하지 않는 리다이렉트");
                current = next;
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("HTTP " + code);
            }
            return c;
        }
        throw new IOException("리다이렉트가 너무 많음");
    }

    private static String fetchText(String url, int maxBytes, String accept) throws IOException {
        HttpURLConnection c = open(url, accept);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                if (out.size() + n > maxBytes) throw new IOException("응답이 너무 큼");
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            c.disconnect();
        }
    }

    // ------------------------------------------------------------------ 도우미

    /** 지금 상태를 처음부터 다시 보낸다 (check 중복·웹 다시 읽기, V2 L6). 사건 목록은 UpdateLogic.resyncEvents (JVM 검사). */
    private void resync() {
        UpdateLogic.Release r = release;
        String phase = state == State.PERMISSION ? "permission"
                : state == State.DOWNLOADING ? "downloading"
                : state == State.INSTALLING ? "installing"
                : "available";
        for (String json : UpdateLogic.resyncEvents(phase, r.version, installedVersionName(), r.notes, r.apkSize, received, verifying, installConfirm)) {
            sink.send(json);
        }
    }

    private void sendAvailable() {
        UpdateLogic.Release r = release;
        sink.send(UpdateLogic.jsonObject("type", "available", "version", r.version, "current", installedVersionName(),
                "notes", r.notes, "size", r.apkSize));
    }

    private void fail(final String code, final Exception e) {
        Log.w(TAG, "업데이트 실패 (" + code + ")", e);
        post(new Runnable() { @Override public void run() { failNow(code, String.valueOf(e.getMessage())); } });
    }

    private void failNow(String code, String why) {
        Log.w(TAG, "업데이트 실패 (" + code + "): " + why);
        state = State.FAILED;
        sink.send(UpdateLogic.jsonObject("type", "error", "code", code));
    }

    private void post(Runnable r) {
        main.post(new Runnable() { @Override public void run() {
            if (active == Updater.this) r.run();
        }});
    }

    private String installedVersionName() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    private long installedVersionCode() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).getLongVersionCode();
        } catch (PackageManager.NameNotFoundException e) {
            return -1;
        }
    }

    private static void clearDir(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) deleteQuietly(f);
    }

    private static void deleteQuietly(File f) {
        if (f != null && f.exists() && !f.delete()) Log.w(TAG, "지우지 못함: " + f);
    }

    private static final class Cancelled extends Exception {
        private static final long serialVersionUID = 1L;
    }

    private static final class VerifyFailed extends Exception {
        private static final long serialVersionUID = 1L;

        VerifyFailed(String why) {
            super(why);
        }
    }
}
