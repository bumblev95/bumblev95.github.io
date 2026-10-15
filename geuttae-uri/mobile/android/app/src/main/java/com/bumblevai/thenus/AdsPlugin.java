package com.bumblevai.thenus;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.concurrent.atomic.AtomicBoolean;

/** No photo, room code, nickname or game answer is passed to Google. All SDK calls run on UI. */
@CapacitorPlugin(name = "ThenusAds")
public class AdsPlugin extends Plugin {
    private ConsentInformation consent;
    private SharedPreferences preferences;
    private final AtomicBoolean initialized = new AtomicBoolean(false);
    private boolean initializing, updating, loading, showing, choosing, consentReady, destroyed;
    private int consentRevision;
    private InterstitialAd ad;
    private long loadedAt, lastLoad = -60_000, lastShown = -300_000;
    private String lastBreak = "";
    private PluginCall displayCall;
    private boolean accountAllowsAds, checkingAccount;

    void resetEligibility() { accountAllowsAds = false; consentRevision++; ad = null; }

    @Override public void load() {
        preferences = getContext().getSharedPreferences("thenus_ad_privacy", Context.MODE_PRIVATE);
        // The first eligible break/settings visit refreshes UMP once in this launch.
        // Do not asynchronously open a consent form over a timed question after startup.
    }

    private void result(PluginCall call, String status, boolean shown) {
        JSObject value = new JSObject();
        value.put("status", status); value.put("shown", shown);
        value.put("enabled", BuildConfig.ADS_ENABLED); value.put("testMode", BuildConfig.DEBUG);
        value.put("privacyRequired", consent != null && consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        call.resolve(value);
    }

    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> result(call, "configured", false));
    }

    // This is an eligibility self-declaration, not identity verification or a content-age gate.
    private void chooseAge(PluginCall call, Runnable adult) {
        if (choosing) { result(call, "busy", false); return; }
        choosing = true;
        boolean ko = "ko".equals(call.getString("language", "en"));
        new AlertDialog.Builder(getActivity())
            .setTitle(ko ? "광고 개인정보 설정" : "Ad privacy settings")
            .setMessage(ko ? "만 18세 이상인가요? 광고는 성인으로 선택한 경우에만 준비해요. 생년월일은 받지 않고 선택은 이 기기에만 저장해요. 게임은 어느 선택이든 계속 이용할 수 있어요."
                : "Are you 18 or older? Ads are prepared only for users who select 18+. We do not ask for a birth date; this choice stays on your device. Either choice lets you keep playing.")
            .setPositiveButton(ko ? "만 18세 이상" : "18 or older", (dialog, which) -> {
                choosing = false;
                preferences.edit().putInt("ageGroup", 1).apply(); adult.run();
            })
            .setNegativeButton(ko ? "만 18세 미만" : "Under 18", (dialog, which) -> {
                choosing = false; consentReady = false; consentRevision++;
                preferences.edit().putInt("ageGroup", 2).apply(); ad = null;
                result(call, "age-ineligible", false);
            })
            .setNeutralButton(ko ? "나중에" : "Later", (dialog, which) -> { choosing = false; preferences.edit().putInt("ageGroup", -1).apply(); result(call, "cancelled", false); })
            .setOnCancelListener(dialog -> { choosing = false; result(call, "cancelled", false); }).show();
    }

    private boolean adultChoice() { return BuildConfig.ADS_ENABLED && preferences.getInt("ageGroup", 0) == 1; }
    private boolean eligible() { return accountAllowsAds && adultChoice(); }

    private void updateConsent(Runnable done) {
        if (!adultChoice() || updating) { done.run(); return; }
        updating = true; ad = null; consentReady = false; consentRevision++;
        consent = UserMessagingPlatform.getConsentInformation(getContext());
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().setTagForUnderAgeOfConsent(false).build();
        consent.requestConsentInfoUpdate(getActivity(), params, () ->
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), error -> {
                updating = false;
                consentReady = error == null && consent.canRequestAds() && adultChoice();
                if (error == null && consent.canRequestAds() && eligible()) initializeAds();
                done.run();
            }), error -> { updating = false; done.run(); });
    }

    private void initializeAds() {
        if (initialized.get()) { preload(); return; }
        if (initializing || !eligible() || updating || consent == null || !consent.canRequestAds()) return;
        initializing = true;
        MobileAds.setRequestConfiguration(new RequestConfiguration.Builder()
            .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_G).build());
        MobileAds.initialize(getContext(), status -> getActivity().runOnUiThread(() -> {
            initializing = false; initialized.set(true); preload();
        }));
    }

    private boolean allowed() {
        return !destroyed && eligible() && initialized.get() && !updating && !choosing && consentReady && consent != null && consent.canRequestAds();
    }

    private void preload() {
        long now = SystemClock.elapsedRealtime();
        if (!allowed() || loading || showing || ad != null || now - lastLoad < 60_000) return;
        lastLoad = now; loading = true;
        final int revision = consentRevision;
        InterstitialAd.load(getContext(), BuildConfig.INTERSTITIAL_ID, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull InterstitialAd loaded) {
                loading = false;
                if (!allowed() || revision != consentRevision) return;
                ad = loaded; loadedAt = SystemClock.elapsedRealtime();
            }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError error) { loading = false; ad = null; }
        });
    }

    @PluginMethod public void privacy(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!BuildConfig.ADS_ENABLED) { result(call, "disabled", false); return; }
            if (updating || showing) { result(call, "busy", false); return; }
            if (preferences.getInt("ageGroup", 0) != 1) {
                chooseAge(call, () -> updateConsent(() -> result(call, consentReady ? "updated" : "unavailable", false))); return;
            }
            if (consent == null || !consentReady) { updateConsent(() -> result(call, consentReady ? "updated" : "unavailable", false)); return; }
            if (consent.getPrivacyOptionsRequirementStatus() != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                result(call, "not-required", false); return;
            }
            updating = true; ad = null; consentReady = false; consentRevision++;
            UserMessagingPlatform.showPrivacyOptionsForm(getActivity(), error -> {
                updating = false;
                consentReady = error == null && consent.canRequestAds() && adultChoice();
                if (error == null) initializeAds();
                result(call, error == null ? "updated" : "unavailable", false);
            });
        });
    }

    @PluginMethod public void ageChoice(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!BuildConfig.ADS_ENABLED || updating || showing) { result(call, "disabled", false); return; }
            chooseAge(call, () -> updateConsent(() -> result(call, consentReady ? "updated" : "unavailable", false)));
        });
    }

    @PluginMethod public void showAtBreak(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!BuildConfig.ADS_ENABLED) { result(call, "disabled", false); return; }
            if (checkingAccount || showing || updating) { result(call, "skipped", false); return; }
            com.getcapacitor.PluginHandle handle = getBridge().getPlugin("ThenusAccount");
            if (handle == null) { result(call, "account-check", false); return; }
            checkingAccount = true; final int revision = consentRevision;
            ((AccountPlugin) handle.getInstance()).checkAdvertising(allowed -> getActivity().runOnUiThread(() -> {
                checkingAccount = false;
                if (destroyed || revision != consentRevision) { result(call, "skipped", false); return; }
                accountAllowsAds = allowed;
                if (!allowed) { ad = null; result(call, "account-check", false); return; }
                showEligibleBreak(call);
            }));
        });
    }

    private void showEligibleBreak(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!BuildConfig.ADS_ENABLED) { result(call, "disabled", false); return; }
            boolean test = BuildConfig.DEBUG && "test".equals(call.getString("placement"));
            String key = call.getString("breakKey", "");
            if (!test && (!"completed-game".equals(call.getString("placement")) || key.isEmpty() || key.length() > 100)) {
                result(call, "invalid-placement", false); return;
            }
            if (showing || updating || (!test && key.equals(lastBreak))) { result(call, "skipped", false); return; }
            if (!test) lastBreak = key;
            if (preferences.getInt("ageGroup", 0) == 0) {
                chooseAge(call, () -> updateConsent(() -> result(call, consentReady ? "preparing" : "unavailable", false))); return;
            }
            if (eligible() && !consentReady) {
                updateConsent(() -> result(call, consentReady ? "preparing" : "unavailable", false)); return;
            }
            if (!allowed()) { result(call, "not-ready", false); return; }
            long now = SystemClock.elapsedRealtime();
            if (ad != null && now - loadedAt > 55 * 60_000) ad = null;
            if (ad == null || (!test && now - lastShown < 300_000) ||
                !getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) {
                preload(); result(call, "not-ready", false); return;
            }
            InterstitialAd ready = ad; ad = null; showing = true; displayCall = call;
            ready.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdShowedFullScreenContent() { lastShown = SystemClock.elapsedRealtime(); }
                @Override public void onAdDismissedFullScreenContent() { finishDisplay("dismissed", true); }
                @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError error) { finishDisplay("unavailable", false); }
            });
            try { ready.show(getActivity()); }
            catch (RuntimeException error) { finishDisplay("unavailable", false); }
        });
    }

    private void finishDisplay(String status, boolean shown) {
        showing = false;
        PluginCall pending = displayCall; displayCall = null;
        if (pending != null) result(pending, status, shown);
        if (!getActivity().isFinishing() && !getActivity().isDestroyed()) preload();
    }

    @Override protected void handleOnDestroy() {
        destroyed = true; ad = null;
        if (displayCall != null) finishDisplay("closed", false);
        super.handleOnDestroy();
    }
}
