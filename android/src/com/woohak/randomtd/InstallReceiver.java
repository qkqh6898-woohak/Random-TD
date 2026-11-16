package com.woohak.randomtd;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

/**
 * PackageInstaller 세션 결과 (U-1). Updater가 만든 명시적 PendingIntent로만 온다 — 매니페스트에 exported="false".
 * STATUS_PENDING_USER_ACTION이면 시스템 설치 확인 창(Intent.EXTRA_INTENT)을 연다.
 */
public final class InstallReceiver extends BroadcastReceiver {
    static final String ACTION = "com.woohak.randomtd.action.INSTALL_STATUS";

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        Intent confirm = null;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            confirm = Build.VERSION.SDK_INT >= 33
                    ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                    : (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
        }
        Updater.onInstallStatus(context, status, confirm, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
    }
}
