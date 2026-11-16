package com.woohak.randomtd;

import android.app.Activity;
import android.content.res.AssetManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
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

public final class GameActivity extends Activity {
    private static final String GAME_HOST = "appassets.androidplatform.net";
    private static final String GAME_PATH = "/game/";
    private static final int BACKGROUND = 0xff0d1220;

    private FrameLayout root;
    private WebView game;
    private OnBackInvokedCallback backCallback;
    private boolean handlingBack;

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
        game.evaluateJavascript("(function() {" +
                "const dialog = document.querySelector('dialog[open]');" +
                "if (dialog) { dialog.close(); return true; }" +
                "return !window.dispatchEvent(new Event('randomtd:native-back', { cancelable: true }));" +
                "})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String result) {
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
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
            backCallback = null;
        }
        if (game != null) {
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
                String encoding = mime.startsWith("text/") || mime.equals("application/javascript") ? "UTF-8" : null;
                return new WebResourceResponse(mime, encoding, 200, "OK",
                        Collections.singletonMap("Cache-Control", "no-store"), assets.open(path));
            } catch (IOException ignored) {
                return missing();
            }
        }

        // Serve the Vite output from an HTTPS origin so script modules resolve locally.
        private static String assetPath(Uri uri) {
            if (!"https".equals(uri.getScheme()) || !GAME_HOST.equals(uri.getAuthority())) return null;
            String path = uri.getPath();
            if ((GAME_PATH + "index.html").equals(path)) return "index.html";
            String prefix = GAME_PATH + "assets/";
            if (path == null || !path.startsWith(prefix)) return null;
            String name = path.substring(prefix.length());
            if (!name.matches("[A-Za-z0-9_.-]+") || name.equals(".") || name.equals("..")) return null;
            return "assets/" + name;
        }

        private static String mimeType(String path) {
            if (path.endsWith(".js")) return "application/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".webp")) return "image/webp";
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
