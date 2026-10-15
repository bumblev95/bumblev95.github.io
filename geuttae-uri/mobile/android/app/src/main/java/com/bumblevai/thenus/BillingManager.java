package com.bumblevai.thenus;

import android.os.Handler;
import android.os.Looper;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.PluginCall;
import java.util.Collections;
import java.util.List;
import org.json.JSONObject;

/** Play tokens stay native and travel only to the fixed account API. Never consume ad removal. */
final class BillingManager {
    private static final String PRODUCT = "thenus_remove_ads";
    private final AccountPlugin owner;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private BillingClient client;
    private PluginCall call;
    private String action, session, accountId, displayedPrice;
    private JSONObject state;
    private int generation;
    private boolean running, processing, destroyed;

    BillingManager(AccountPlugin plugin) { owner = plugin; }
    void start(PluginCall next, String operation) {
        owner.ui(() -> {
            if (destroyed) { owner.finishBilling(next, "BILLING_UNAVAILABLE", null); return; }
            call = next; action = operation; running = true; processing = false;
            final int revision = ++generation;
            timer.postDelayed(() -> { if (valid(revision)) finish("PURCHASE_VERIFY_RETRY"); }, "buy".equals(action) ? 300_000 : 60_000);
            owner.background(() -> {
                try {
                    final String expectedSession = owner.token();
                    if (expectedSession == null) { owner.ui(() -> { if (valid(revision)) finish("SIGN_IN_REQUIRED"); }); return; }
                    JSONObject response = owner.request("billing/context", null, expectedSession);
                    if (!owner.getContext().getPackageName().equals(response.getString("packageName")) || !PRODUCT.equals(response.getString("productId"))) {
                        owner.ui(() -> { if (valid(revision)) finish("BILLING_PACKAGE_MISMATCH"); }); return;
                    }
                    owner.ui(() -> {
                        if (!valid(revision)) return;
                        state = response; session = expectedSession; accountId = response.optString("obfuscatedAccountId");
                        if (state.optBoolean("adFree")) { finish("ad-free"); return; }
                        connect(revision);
                    });
                } catch (Exception error) { failed(revision, error); }
            });
        });
    }
    private boolean valid(int revision) { return !destroyed && running && generation == revision; }
    private void failed(int revision, Exception error) {
        String code = error instanceof AccountPlugin.AccountFailure ? ((AccountPlugin.AccountFailure) error).code : "BILLING_UNAVAILABLE";
        if ("SIGN_IN_NOT_CONFIGURED".equals(code)) code = "BILLING_NOT_CONFIGURED";
        String result = code; owner.ui(() -> { if (valid(revision)) finish(result); });
    }
    private void finish(String status) {
        if (!running) return;
        running = false; processing = false; generation++;
        timer.removeCallbacksAndMessages(null);
        PluginCall pending = call; call = null;
        // Only allowlisted public fields are returned to the web view.
        owner.finishBilling(pending, status, state);
        session = null; accountId = null; state = null;
    }
    private void connect(int revision) {
        if (client != null && client.isReady()) { owned(revision); return; }
        if (client != null) client.endConnection();
        client = BillingClient.newBuilder(owner.getContext())
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .setListener((result, purchases) -> owner.ui(() -> {
                if (!running) return;
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) process(generation, purchases);
                else if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) finish("cancelled");
                else if (result.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { action = "restore"; owned(generation); }
                else finish("BILLING_UNAVAILABLE");
            })).build();
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) { owner.ui(() -> {
                if (!valid(revision)) return;
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) owned(revision);
                else finish("BILLING_UNAVAILABLE");
            }); }
            @Override public void onBillingServiceDisconnected() { /* Automatic reconnect on the next API call. */ }
        });
    }
    private void owned(int revision) {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
            (result, purchases) -> owner.ui(() -> {
                if (!valid(revision) || processing) return;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { finish("BILLING_UNAVAILABLE"); return; }
                process(revision, purchases);
            }));
    }
    private void process(int revision, List<Purchase> purchases) {
        if (!valid(revision) || processing) return;
        Purchase found = null;
        if (purchases != null) for (Purchase purchase : purchases) if (purchase.getProducts().contains(PRODUCT)) { found = purchase; break; }
        if (found == null) {
            if ("restore".equals(action)) { finish("nothing-to-restore"); return; }
            product(revision); return;
        }
        if (found.getPurchaseState() == Purchase.PurchaseState.PENDING) { finish("PURCHASE_PENDING"); return; }
        if (found.getPurchaseState() != Purchase.PurchaseState.PURCHASED) { finish("PURCHASE_VERIFY_RETRY"); return; }
        processing = true;
        final String receipt = found.getPurchaseToken(), expectedSession = session;
        owner.background(() -> {
            try {
                if (!expectedSession.equals(owner.token())) throw new AccountPlugin.AccountFailure("SIGN_IN_REQUIRED");
                JSONObject verified = owner.request("billing/verify", new JSONObject().put("purchaseToken", receipt), expectedSession);
                owner.ui(() -> {
                    if (!valid(revision)) return;
                    if (!verified.optBoolean("adFree")) { finish("PURCHASE_VERIFY_RETRY"); return; }
                    try { state.put("adFree", true); } catch (Exception ignored) { /* initialized JSON object */ }
                    finish("ad-free");
                });
            } catch (Exception error) { failed(revision, error); }
        });
    }
    private void product(int revision) {
        QueryProductDetailsParams.Product item = QueryProductDetailsParams.Product.newBuilder().setProductId(PRODUCT).setProductType(BillingClient.ProductType.INAPP).build();
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(item)).build(),
            (result, details) -> owner.ui(() -> {
                if (!valid(revision)) return;
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.getProductDetailsList().size() != 1) { finish("PRODUCT_UNAVAILABLE"); return; }
                ProductDetails product = details.getProductDetailsList().get(0);
                List<ProductDetails.OneTimePurchaseOfferDetails> offers = product.getOneTimePurchaseOfferDetailsList();
                // Console setup uses exactly one permanent buy option; never silently select rent/preorder.
                if (!PRODUCT.equals(product.getProductId()) || offers == null || offers.size() != 1 ||
                    offers.get(0).getRentalDetails() != null || offers.get(0).getPreorderDetails() != null) { finish("PRODUCT_UNAVAILABLE"); return; }
                ProductDetails.OneTimePurchaseOfferDetails offer = offers.get(0);
                String price = offer.getFormattedPrice();
                String priceIdentity = offer.getPriceCurrencyCode() + ":" + offer.getPriceAmountMicros();
                try { state.put("price", price); } catch (Exception ignored) { /* initialized JSON object */ }
                if (!"buy".equals(action)) { displayedPrice = priceIdentity; finish("available"); return; }
                if (displayedPrice == null || !displayedPrice.equals(priceIdentity)) { displayedPrice = priceIdentity; finish("PRICE_CHANGED"); return; }
                if (accountId == null || !accountId.matches("[a-f0-9]{64}")) { finish("SIGN_IN_REQUIRED"); return; }
                BillingFlowParams.ProductDetailsParams.Builder selection = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product);
                if (offer.getOfferToken() != null && !offer.getOfferToken().isEmpty()) selection.setOfferToken(offer.getOfferToken());
                BillingFlowParams params = BillingFlowParams.newBuilder().setObfuscatedAccountId(accountId)
                    .setProductDetailsParamsList(Collections.singletonList(selection.build())).build();
                BillingResult launched = client.launchBillingFlow(owner.getActivity(), params);
                if (launched.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { action = "restore"; owned(revision); }
                else if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) finish("BILLING_UNAVAILABLE");
            }));
    }
    void resume() {
        // A pending checkout can complete while Play's UI was open; query only an already-started operation.
        if (running && client != null && client.isReady() && !processing) { action = "restore"; owned(generation); }
        else if (!running && client != null && owner.beginBillingResume()) start(null, "restore");
    }
    void close() { destroyed = true; timer.removeCallbacksAndMessages(null); if (client != null) client.endConnection(); }
}
