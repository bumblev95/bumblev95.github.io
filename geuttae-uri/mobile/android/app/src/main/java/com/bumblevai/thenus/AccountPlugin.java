package com.bumblevai.thenus;

import android.content.Context;
import android.content.MutableContextWrapper;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Only safe account details cross the JS bridge. ID tokens and session secrets stay native. */
@CapacitorPlugin(name = "ThenusAccount")
public class AccountPlugin extends Plugin {
    private static final String API = "https://geuttae-api-test-production.up.railway.app";
    private static final String KEY = "thenus_account_session_v1";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private CancellationSignal cancellation;
    private final BillingManager billing = new BillingManager(this);

    static class AccountFailure extends Exception {
        final String code;
        AccountFailure(String value) { super(value); code = value; }
    }
    JSONObject request(String endpoint, JSONObject body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create(API + "/api/account/" + endpoint).toURL().openConnection();
        connection.setConnectTimeout(10_000); connection.setReadTimeout(15_000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestProperty("Origin", API);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        try {
            if (body != null) {
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status == 404) throw new AccountFailure("SIGN_IN_NOT_CONFIGURED");
            java.io.InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new AccountFailure("UNAVAILABLE");
            JSONObject data;
            try (java.io.InputStream input = stream; java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048]; int read;
                while ((read = input.read(buffer)) != -1) {
                    if (output.size() + read > 16_384) throw new AccountFailure("UNAVAILABLE");
                    output.write(buffer, 0, read);
                }
                data = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
            if (status < 200 || status >= 300) throw new AccountFailure(data.optString("error", "UNAVAILABLE"));
            return data;
        } finally { connection.disconnect(); }
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(KEY)) return (SecretKey) store.getKey(KEY, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private void saveToken(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
            Base64.encodeToString(cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        if (!getContext().getSharedPreferences(KEY, Context.MODE_PRIVATE).edit().putString("encrypted", value).commit())
            throw new AccountFailure("STORAGE_FAILED");
    }
    String token() {
        String value = getContext().getSharedPreferences(KEY, Context.MODE_PRIVATE).getString("encrypted", null);
        if (value == null) return null;
        try {
            String[] parts = value.split("\\.", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            String result = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
            if (!result.matches("[a-f0-9]{64}")) throw new AccountFailure("SIGN_IN_REQUIRED");
            return result;
        } catch (Exception error) { forgetToken(); return null; }
    }
    private void forgetToken() { getContext().getSharedPreferences(KEY, Context.MODE_PRIVATE).edit().clear().commit(); }
    private boolean begin(PluginCall call) {
        if (busy.compareAndSet(false, true)) return true;
        JSObject result = new JSObject(); result.put("status", "busy"); call.resolve(result); return false;
    }
    private void finish(PluginCall call, String status, JSONObject account) {
        invalidateAdvertising();
        busy.set(false); JSObject value = new JSObject(); value.put("status", status);
        if (account != null) { JSObject safe = new JSObject(); safe.put("id", account.optString("id")); safe.put("email", account.optString("email")); value.put("account", safe); }
        call.resolve(value);
    }
    void background(Runnable work) { worker.execute(work); }
    boolean beginBillingResume() { return token() != null && busy.compareAndSet(false, true); }
    boolean billingRestoreNeeded() { return getContext().getSharedPreferences(KEY, Context.MODE_PRIVATE).getBoolean("restoreNeeded", false); }
    boolean markBillingRestoreNeeded(boolean value) { return getContext().getSharedPreferences(KEY, Context.MODE_PRIVATE).edit().putBoolean("restoreNeeded", value).commit(); }
    void ui(Runnable work) { getActivity().runOnUiThread(work); }
    void invalidateAdvertising() {
        ui(() -> {
            com.getcapacitor.PluginHandle handle = getBridge().getPlugin("ThenusAds");
            if (handle != null) ((AdsPlugin) handle.getInstance()).resetEligibility();
        });
    }
    // Native-only: no JavaScript boolean can unlock a purchase or change advertising eligibility.
    void checkAdvertising(java.util.function.Consumer<Boolean> done) {
        if (busy.get()) { done.accept(false); return; }
        AtomicBoolean delivered = new AtomicBoolean(false);
        // A slow entitlement service must not hold the next game behind an ad check.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (delivered.compareAndSet(false, true)) done.accept(false);
        }, 1_000);
        background(() -> {
            boolean allowed = false;
            try {
                String session = token();
                allowed = session == null || !request("billing/status", null, session).getBoolean("adFree");
            } catch (Exception ignored) { /* Unknown paid status: skip this ad, retry at the next break. */ }
            boolean safe = allowed && !busy.get();
            ui(() -> { if (delivered.compareAndSet(false, true)) done.accept(safe); });
        });
    }
    void finishBilling(PluginCall call, String status, JSONObject details) {
        invalidateAdvertising(); busy.set(false);
        JSObject value = new JSObject(); value.put("status", status);
        if (details != null) for (String name : new String[]{"adFree", "enabled", "price"})
            if (details.has(name)) value.put(name, details.opt(name));
        if (call != null) call.resolve(value);
        else notifyListeners("billingChanged", value);
    }
    @PluginMethod public void billingStatus(PluginCall call) { if (begin(call)) billing.start(call, "status"); }
    @PluginMethod public void billingBuy(PluginCall call) {
        android.content.SharedPreferences age = getContext().getSharedPreferences("thenus_ad_privacy", Context.MODE_PRIVATE);
        if (!age.getBoolean("ageGate13PlusV1", false) || age.getInt("ageGroup", 0) != 1) {
            JSObject result = new JSObject(); result.put("status", "AGE_RESTRICTED"); call.resolve(result); return;
        }
        if (begin(call)) { invalidateAdvertising(); billing.start(call, "buy"); }
    }
    @PluginMethod public void billingRestore(PluginCall call) { if (begin(call)) billing.start(call, "restore"); }
    private void fail(PluginCall call, Exception error) {
        String code = error instanceof AccountFailure ? ((AccountFailure) error).code : "UNAVAILABLE";
        if ("SIGN_IN_REQUIRED".equals(code)) forgetToken();
        finish(call, code, null);
    }
    @PluginMethod public void status(PluginCall call) {
        if (!begin(call)) return;
        worker.execute(() -> {
            try {
                String session = token();
                if (session != null) { finish(call, "signed-in", request("me", null, session).getJSONObject("account")); return; }
                finish(call, request("config", null, null).optBoolean("enabled") ? "signed-out" : "SIGN_IN_NOT_CONFIGURED", null);
            } catch (Exception error) { fail(call, error); }
        });
    }
    @PluginMethod public void signIn(PluginCall call) {
        if (!begin(call)) return;
        worker.execute(() -> {
            try {
                JSONObject challenge = request("challenge", new JSONObject(), null);
                getActivity().runOnUiThread(() -> chooseAccount(call, challenge));
            } catch (Exception error) { fail(call, error); }
        });
    }
    private void chooseAccount(PluginCall call, JSONObject challenge) {
        try {
            GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(challenge.getString("clientId"))
                .setNonce(challenge.getString("nonce")).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            cancellation = new CancellationSignal();
            CredentialManager.create(getContext()).getCredentialAsync(new MutableContextWrapper(getActivity()), request, cancellation,
                androidx.core.content.ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override public void onResult(GetCredentialResponse result) {
                        if (!(result.getCredential() instanceof CustomCredential) ||
                            !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(result.getCredential().getType())) {
                            finish(call, "GOOGLE_VERIFICATION_FAILED", null); return;
                        }
                        try {
                            String idToken = GoogleIdTokenCredential.createFrom(result.getCredential().getData()).getIdToken();
                            worker.execute(() -> {
                                try {
                                    JSONObject body = new JSONObject().put("challenge", challenge.getString("challenge")).put("idToken", idToken);
                                    JSONObject data = request("google", body, null); String session = data.getString("token");
                                    try { saveToken(session); }
                                    catch (Exception error) { try { request("logout", new JSONObject(), session); } catch (Exception ignored) { /* Expiry also revokes. */ } throw error; }
                                    finish(call, "signed-in", data.getJSONObject("account"));
                                } catch (Exception error) { fail(call, error); }
                            });
                        } catch (Exception error) { finish(call, "GOOGLE_VERIFICATION_FAILED", null); }
                    }
                    @Override public void onError(@NonNull GetCredentialException error) {
                        finish(call, error instanceof GetCredentialCancellationException ? "cancelled" : "GOOGLE_SIGN_IN_FAILED", null);
                    }
                });
        } catch (Exception error) { fail(call, error); }
    }
    private void clearProvider(PluginCall call, String result) {
        CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
            androidx.core.content.ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void unused) { finish(call, result, null); }
                @Override public void onError(@NonNull ClearCredentialException error) { finish(call, result, null); }
            });
    }
    @PluginMethod public void signOut(PluginCall call) { remove(call, false); }
    @PluginMethod public void deleteAccount(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("confirmed", false))) {
            JSObject value = new JSObject();value.put("status", "DELETE_CONFIRMATION_REQUIRED");call.resolve(value);return;
        }
        remove(call, true);
    }
    private void remove(PluginCall call, boolean deleting) {
        if (!begin(call)) return;
        worker.execute(() -> {
            try {
                String session = token();
                if (session != null) {
                    try { request(deleting ? "delete" : "logout", new JSONObject().put("confirmed", deleting), session); }
                    catch (AccountFailure error) { if (!"SIGN_IN_REQUIRED".equals(error.code)) throw error; }
                }
                forgetToken();getActivity().runOnUiThread(() -> clearProvider(call, deleting ? "deleted" : "signed-out"));
            } catch (Exception error) { fail(call, error); }
        });
    }
    @Override protected void handleOnResume() { super.handleOnResume(); billing.resume(); }
    @Override protected void handleOnDestroy() {
        billing.close();
        if (cancellation != null) cancellation.cancel();
        worker.shutdown();super.handleOnDestroy();
    }
}
