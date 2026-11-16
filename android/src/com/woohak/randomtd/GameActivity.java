package com.woohak.randomtd;

import android.app.Activity;
import android.content.res.AssetManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Collections;

/**
 * 운빨 디펜스 안드로이드 래퍼: WebView 하나로 APK assets/의 Vite 빌드(dist/)를 https://appassets.androidplatform.net/game/ 에서 연다.
 * - 오프라인: 게임 파일은 모두 APK 안 (AssetPaths가 주소 → assets 경로, 하위 폴더 그림 포함).
 * - 뒤로 가기: 페이지에 취소 가능한 'randomtd:native-back' 사건 → 웹이 처리했으면(열린 창 닫기·일시정지/계속) 그대로, 아니면 앱 종료.
 * - 백그라운드: 'randomtd:native-pause' → 전투면 일시정지 + 자동 저장.
 * - 앱 안 업데이트 (U-1): JS 다리 window.RandomTDNative (checkUpdate·startUpdate·openInstallSettings·cancelUpdate, 인자 없음)
 *   → Updater(자바 HTTPS·PackageInstaller) → 결과는 window.__rtdUpdate(JSON). 게임 주소 페이지에서만 받고 보낸다.
 *   WebView 자체는 여전히 APK 안 파일만 연다 (GameAssets가 다른 주소를 모두 404·이동 막음).
 * applicationId·서명은 v0.1.7과 같다 (업데이트 설치).
 */
public final class GameActivity extends Activity {
    private static final String GAME_HOST = AssetPaths.GAME_HOST;
    private static final String GAME_PATH = AssetPaths.GAME_PATH;
    private static final int BACKGROUND = 0xff0d1220;

    private FrameLayout root;
    private WebView game;
    private OnBackInvokedCallback backCallback;
    private Updater updater;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean handlingBack;
    /** evaluateJavascript 답이 오지 않으면(페이지가 멈춤 등) 이만큼 뒤에 다시 뒤로 가기를 받는다 */
    private static final long BACK_TIMEOUT_MS = 1000;
    private final Handler backTimeout = new Handler(Looper.getMainLooper());
    private final Runnable releaseBack = new Runnable() {
        @Override
        public void run() {
            handlingBack = false;
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        keepGameInsideSystemBars();

        game = new WebView(this);
        game.setBackgroundColor(BACKGROUND);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        game.setWebViewClient(new GameAssets(getAssets()));
        updater = new Updater(this, new Updater.Sink() {
            @Override
            public void send(String json) {
                sendToGame(json);
            }
        });
        game.addJavascriptInterface(new NativeBridge(), "RandomTDNative");

        root.addView(game, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = new OnBackInvokedCallback() {
                @Override
                public void onBackInvoked() {
                    handleGameBack();
                }
            };
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        game.loadUrl("https://" + GAME_HOST + GAME_PATH + "index.html");
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleGameBack();
    }

    private void handleGameBack() {
        if (handlingBack) return;
        if (game == null) {
            finish();
            return;
        }
        handlingBack = true;
        backTimeout.removeCallbacks(releaseBack);
        backTimeout.postDelayed(releaseBack, BACK_TIMEOUT_MS);
        // 웹 쪽(src/ui/nativeBack.ts)이 열린 <dialog> → 장면 처리기 순서로 처리한다. 스크립트가 없거나 오류면 false → 앱 종료.
        game.evaluateJavascript("(function() {" +
                "try { return !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true })); }" +
                "catch (e) { return false; }" +
                "})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String result) {
                backTimeout.removeCallbacks(releaseBack);
                handlingBack = false;
                if (!"true".equals(result) && !isFinishing()) finish();
            }
        });
    }

    @SuppressWarnings("deprecation")
    private void keepGameInsideSystemBars() {
        if (Build.VERSION.SDK_INT < 30) {
            getWindow().setStatusBarColor(BACKGROUND);
            getWindow().setNavigationBarColor(BACKGROUND);
            return;
        }
        getWindow().setDecorFitsSystemWindows(false);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (game != null) game.onResume();
        if (updater != null) updater.onResume();
    }

    /** 지금 WebView가 게임 주소(https://appassets.androidplatform.net/game/…)를 열고 있나 (UI 스레드) */
    private boolean onGamePage() {
        if (game == null) return false;
        String url = game.getUrl();
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return AssetPaths.assetPath(uri.getScheme(), uri.getAuthority(), uri.getPath()) != null;
    }

    /** 업데이트 결과를 웹으로 (json은 UpdateLogic.jsonObject가 만든 이스케이프된 JSON — 그대로 JS 식) */
    private void sendToGame(String json) {
        if (!onGamePage()) return;
        game.evaluateJavascript("window.__rtdUpdate && window.__rtdUpdate(" + json + ")", null);
    }

    /**
     * JS 다리 (U-1). 메서드는 JavaBridge 스레드에서 불리므로 UI 스레드로 넘기고, 그때 게임 주소 페이지인지 확인한다.
     * 인자를 받지 않는다 — 웹은 주소·파일을 고를 수 없고, '확인/시작/설정 열기/취소'만 요청한다.
     */
    public final class NativeBridge {
        @JavascriptInterface
        public void checkUpdate() {
            run(new Runnable() {
                @Override
                public void run() {
                    updater.check();
                }
            });
        }

        @JavascriptInterface
        public void startUpdate() {
            run(new Runnable() {
                @Override
                public void run() {
                    updater.start();
                }
            });
        }

        @JavascriptInterface
        public void openInstallSettings() {
            run(new Runnable() {
                @Override
                public void run() {
                    updater.openInstallSettings();
                }
            });
        }

        @JavascriptInterface
        public void cancelUpdate() {
            run(new Runnable() {
                @Override
                public void run() {
                    updater.cancel();
                }
            });
        }

        private void run(final Runnable action) {
            ui.post(new Runnable() {
                @Override
                public void run() {
                    if (updater != null && !isFinishing() && onGamePage()) action.run();
                }
            });
        }
    }

    @Override
    protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("window.dispatchEvent(new Event('randomtd:native-pause'))", null);
            game.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        backTimeout.removeCallbacks(releaseBack);
        ui.removeCallbacksAndMessages(null);
        if (updater != null) {
            updater.destroy();
            updater = null;
        }
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
        if (game != null) {
            game.removeJavascriptInterface("RandomTDNative");
            root.removeView(game);
            game.stopLoading();
            game.destroy();
            game = null;
        }
        super.onDestroy();
    }

    private static final class GameAssets extends WebViewClient {
        private final AssetManager assets;

        GameAssets(AssetManager assets) {
            this.assets = assets;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return assetPath(request.getUrl()) == null;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            String path = assetPath(request.getUrl());
            if (path == null || !"GET".equals(request.getMethod())) return missing();
            try {
                String mime = mimeType(path);
                String encoding = mime.startsWith("text/") || mime.equals("application/javascript") || mime.equals("application/json") ? "UTF-8" : null;
                return new WebResourceResponse(mime, encoding, 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), assets.open(path));
            } catch (IOException ignored) {
                return missing();
            }
        }

        // Vite 빌드를 HTTPS 주소로 내보내 모듈 스크립트·상대 경로 그림(assets/characters/… 등 하위 폴더)이 APK 안에서 풀리게 한다.
        private static String assetPath(Uri uri) {
            return AssetPaths.assetPath(uri.getScheme(), uri.getAuthority(), uri.getPath());
        }

        private static String mimeType(String path) {
            String known = AssetPaths.mimeType(path);
            if (known != null) return known;
            String extension = MimeTypeMap.getFileExtensionFromUrl(path);
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return mime == null ? "application/octet-stream" : mime;
        }

        private static WebResourceResponse missing() {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }
}
