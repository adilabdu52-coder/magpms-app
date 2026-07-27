package com.magpms.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.webkit.WebResourceErrorCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * MAGPMS shell: hosts the live MAGPMS web app in a WebView with
 * pull-to-refresh, load progress, an error screen, geolocation support,
 * file import (chooser) and JSON export (Storage Access Framework).
 */
public class MainActivity extends AppCompatActivity {

    private static final String APP_HOST = "magmps.github.io";
    private static final String APP_URL = "https://" + APP_HOST + "/magpms2/index.html";
    /** Kept in-app so old links keep working. */
    private static final String LEGACY_HOST = APP_HOST;
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final int REQ_LOCATION = 41;

    private WebView web;
    private SwipeRefreshLayout swipe;
    private ProgressBar progress;
    private View errorView;

    private ValueCallback<Uri[]> pendingFileChooser;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;
    private String pendingExportContent;

    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private ActivityResultLauncher<Intent> createDocumentLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.web);
        swipe = findViewById(R.id.swipe);
        progress = findViewById(R.id.progress);
        errorView = findViewById(R.id.error_view);

        registerLaunchers();

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                Uri url = request.getUrl();
                String host = url.getHost();
                if (APP_HOST.equals(host) || LEGACY_HOST.equals(host) || ASSET_HOST.equals(host)) return false;
                // External links (map attribution etc.) open in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(@NonNull WebView view, @NonNull WebResourceRequest request,
                                        @NonNull WebResourceErrorCompat error) {
                if (request.isForMainFrame()) showError(true);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipe.setRefreshing(false);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeoCallback = callback;
                    pendingGeoOrigin = origin;
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION},
                            REQ_LOCATION);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams params) {
                if (pendingFileChooser != null) pendingFileChooser.onReceiveValue(null);
                pendingFileChooser = filePathCallback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                } catch (ActivityNotFoundException e) {
                    pendingFileChooser = null;
                    filePathCallback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "No file picker available", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        swipe.setOnRefreshListener(() -> {
            showError(false);
            web.reload();
        });

        findViewById(R.id.btn_retry).setOnClickListener(v -> {
            showError(false);
            web.reload();
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });

        web.loadUrl(APP_URL);
    }

    private void registerLaunchers() {
        fileChooserLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(), result -> {
                    if (pendingFileChooser == null) return;
                    Uri[] uris = null;
                    if (result.getResultCode() == RESULT_OK && result.getData() != null
                            && result.getData().getData() != null) {
                        uris = new Uri[]{result.getData().getData()};
                    }
                    pendingFileChooser.onReceiveValue(uris);
                    pendingFileChooser = null;
                });

        createDocumentLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(), result -> {
                    String content = pendingExportContent;
                    pendingExportContent = null;
                    if (content == null || result.getResultCode() != RESULT_OK
                            || result.getData() == null || result.getData().getData() == null) return;
                    try (OutputStream out = getContentResolver()
                            .openOutputStream(result.getData().getData())) {
                        if (out != null) out.write(content.getBytes(StandardCharsets.UTF_8));
                        Toast.makeText(this, "Export saved", Toast.LENGTH_SHORT).show();
                    } catch (Exception e) {
                        Toast.makeText(this, "Could not save file", Toast.LENGTH_SHORT).show();
                    }
                });
    }

    private void showError(boolean show) {
        errorView.setVisibility(show ? View.VISIBLE : View.GONE);
        swipe.setRefreshing(false);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && pendingGeoCallback != null) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    /** JS bridge exposed to the local web app as window.AndroidBridge. */
    private class Bridge {
        /** Web app disables pull-to-refresh while the map is active or a list is scrolled. */
        @JavascriptInterface
        public void setPullToRefresh(final boolean enabled) {
            runOnUiThread(() -> swipe.setEnabled(enabled));
        }

        /** Saves exported JSON via the system "create document" dialog. */
        @JavascriptInterface
        public void saveFile(final String filename, final String content) {
            runOnUiThread(() -> {
                pendingExportContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    createDocumentLauncher.launch(intent);
                } catch (ActivityNotFoundException e) {
                    pendingExportContent = null;
                    Toast.makeText(MainActivity.this, "No file manager available", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
